import * as pdfjs from 'pdfjs-dist';
import { GoogleGenAI } from '@google/genai';
import mammoth from 'mammoth';
import nlp from 'compromise';
import Fuse from 'fuse.js';
import { withRetry } from './apiUtils';

// ─── Polyfill ──────────────────────────────────────────────────────────────
if (typeof Promise.try !== 'function') {
  Promise.try = function (fn, ...args) {
    return new Promise((resolve, reject) => {
      try { resolve(fn(...args)); } catch (err) { reject(err); }
    });
  };
}

// ─── PDF.js worker ─────────────────────────────────────────────────────────
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

// ─── Internal helper ───────────────────────────────────────────────────────
function makeAI(apiKey) {
  return new GoogleGenAI({ apiKey });
}

// ─── Text extraction ───────────────────────────────────────────────────────

/**
 * Extracts text from a PDF file using parallel page processing.
 * Throws a descriptive error if the PDF is empty or image-only.
 * The PDF document is destroyed after extraction to free memory.
 *
 * @param {File} file
 * @returns {Promise<string>}
 */
export async function extractTextFromPDF(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;

  if (pdf.numPages === 0) {
    pdf.destroy();
    throw new Error('This PDF has no pages. The file may be corrupted.');
  }

  const pagePromises = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    pagePromises.push(
      pdf.getPage(i).then(async (page) => {
        const textContent = await page.getTextContent();
        let lastY;
        let text = '';
        for (const item of textContent.items) {
          if (lastY !== undefined && Math.abs(item.transform[5] - lastY) > 5) {
            text += '\n';
          }
          text += item.str;
          lastY = item.transform[5];
        }
        return `[Page ${i}] ${text}`;
      })
    );
  }

  const pages = await Promise.all(pagePromises);

  // Free the PDF worker memory as soon as we're done.
  pdf.destroy();

  const joined = pages.join('\n\n');

  if (!joined.trim()) {
    throw new Error(
      'No text could be extracted from this PDF. It may be a scanned image-based document. ' +
      'Try opening it in Google Drive and downloading as .docx, then re-uploading.'
    );
  }

  return joined;
}

/**
 * Extracts raw text from a DOCX file using mammoth.
 * Validates the ZIP magic bytes and throws a descriptive error for
 * legacy .doc files, corrupted files, or image-only documents.
 *
 * @param {File} file
 * @returns {Promise<string>}
 */
export async function extractTextFromDocx(file) {
  const arrayBuffer = await file.arrayBuffer();

  // DOCX files are ZIP archives and must start with the PK magic bytes.
  const header = new Uint8Array(arrayBuffer.slice(0, 4));
  if (header[0] !== 0x50 || header[1] !== 0x4B) {
    if (file.name.toLowerCase().endsWith('.doc')) {
      throw new Error(
        'Legacy .doc format is not supported. Please open the file in Word, ' +
        'save it as .docx ("Word Document"), and re-upload.'
      );
    }
    throw new Error(
      'This file does not appear to be a valid DOCX. It may be corrupted or ' +
      'have an incorrect extension. Please verify the file and try again.'
    );
  }

  const result = await mammoth.extractRawText({ arrayBuffer });

  // Surface mammoth's internal warnings in development.
  if (result.messages?.length) {
    console.warn('[mammoth] extraction warnings:', result.messages);
  }

  if (!result.value?.trim()) {
    throw new Error(
      'No text could be extracted from this document. It may contain only images, ' +
      'charts, or embedded objects. Try opening it in Google Drive and downloading ' +
      'as .docx, or export it to PDF first.'
    );
  }

  return result.value;
}

/**
 * Extracts HTML from a DOCX file for preview rendering.
 * Validates the ZIP magic bytes and warns on empty output.
 *
 * @param {File} file
 * @returns {Promise<string>}
 */
export async function extractHtmlFromDocx(file) {
  const arrayBuffer = await file.arrayBuffer();

  // Validate ZIP magic bytes before calling mammoth.
  const header = new Uint8Array(arrayBuffer.slice(0, 4));
  if (header[0] !== 0x50 || header[1] !== 0x4B) {
    if (file.name.toLowerCase().endsWith('.doc')) {
      throw new Error(
        'Legacy .doc format is not supported. Please save the file as .docx and re-upload.'
      );
    }
    throw new Error('File appears corrupted or is not a valid DOCX.');
  }

  const result = await mammoth.convertToHtml({ arrayBuffer }, {
    styleMap: [
      "p[style-name='Center'] => p.text-center",
      "p[style-name='Right'] => p.text-right",
      "p[style-name='Justify'] => p.text-justify",
      "p[style-name='Heading 1'] => h1:fresh",
      "p[style-name='Heading 2'] => h2:fresh",
      "p[style-name='Heading 3'] => h3:fresh",
    ],
  });

  if (result.messages?.length) {
    console.warn('[mammoth] HTML conversion warnings:', result.messages);
  }

  if (!result.value?.trim()) {
    console.warn('[mammoth] HTML output is empty — document may be image-only.');
  }

  return result.value;
}

/**
 * Dispatch function — routes to the correct extractor based on file extension.
 *
 * @param {File} file
 * @returns {Promise<string>}
 */
export async function extractText(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'pdf') return extractTextFromPDF(file);
  if (ext === 'docx') return extractTextFromDocx(file);
  throw new Error(
    `Unsupported file format ".${ext}". Please upload a PDF or DOCX file.`
  );
}

// ─── Chunking ──────────────────────────────────────────────────────────────

/**
 * Calculates adaptive chunking parameters based on document characteristics.
 *
 * @param {string} text
 * @returns {{ chunkSize: number, overlap: number }}
 */
function getOptimalChunkParams(text) {
  const length = text.length;

  if (length < 2000) return { chunkSize: 300, overlap: 50 };

  const punctuation = (text.match(/[.,!?;:()\[\]{}"']/g) || []).length;
  const density = punctuation / length;

  const words = text.trim().split(/\s+/);
  const avgWordLen = length / words.length;

  const isTechnical = avgWordLen > 6.5 || density > 0.04;
  const isNarrative = avgWordLen < 5.5 && density < 0.02;

  let baseSize = 800;
  if (length > 500_000) baseSize = 1500;
  else if (length > 100_000) baseSize = 1200;
  else if (length < 20_000) baseSize = 600;

  if (isTechnical) baseSize *= 0.85;
  else if (isNarrative) baseSize *= 1.25;

  let overlapPct = 0.15;
  if (density > 0.045) overlapPct = 0.25;
  if (density < 0.015) overlapPct = 0.10;

  const chunkSize = Math.floor(baseSize);
  const overlap = Math.floor(chunkSize * overlapPct);

  return { chunkSize, overlap };
}

/**
 * Detects structural headings in text using lightweight heuristics.
 *
 * @param {string} text
 * @returns {Array<{ text: string, lineIndex: number, type: string }>}
 */
function detectHeadings(text) {
  const lines = text.split('\n');
  const headings = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const isShort = line.length < 80;
    const isNumbered = /^(?:(?:Section|Chapter|Part)\s+)?(?:\d+(?:\.\d+)*|[A-Z])[\s.:]/.test(line);
    const isAllCaps = line.length > 3 && line === line.toUpperCase() && /[A-Z]/.test(line);
    const endsWithColon = line.endsWith(':') && line.length < 50;

    if (isShort && (isNumbered || isAllCaps || endsWithColon)) {
      headings.push({
        text: line,
        lineIndex: i,
        type: isNumbered ? 'numbered' : isAllCaps ? 'caps' : 'sub',
      });
    }
  }

  return headings;
}

/**
 * Splits text into semantically coherent chunks using a recursive strategy
 * that respects structural headings.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function chunkText(text) {
  const { chunkSize, overlap } = getOptimalChunkParams(text);
  const headings = detectHeadings(text);

  // Build sections bounded by headings.
  const sections = [];
  if (headings.length === 0) {
    sections.push({ header: '', content: text });
  } else {
    const lines = text.split('\n');
    let currentHeader = 'Introduction';
    let currentContent = [];
    let headingIdx = 0;

    for (let i = 0; i < lines.length; i++) {
      if (headingIdx < headings.length && headings[headingIdx].lineIndex === i) {
        if (currentContent.length > 0) {
          sections.push({ header: currentHeader, content: currentContent.join('\n') });
        }
        currentHeader = headings[headingIdx].text;
        currentContent = [];
        headingIdx++;
      } else {
        currentContent.push(lines[i]);
      }
    }
    if (currentContent.length > 0) {
      sections.push({ header: currentHeader, content: currentContent.join('\n') });
    }
  }

  const separators = ['\n\n', '\n', '; ', '. ', '! ', '? ', ', ', ' ', ''];

  function recursiveSplit(inputText, currentSeparators, targetSize) {
    if (inputText.length <= targetSize) return [inputText];

    const [separator, ...nextSeparators] = currentSeparators;
    const splits = inputText.split(separator);
    const finalChunks = [];
    let currentBuffer = '';

    for (const split of splits) {
      if (split.length > targetSize && nextSeparators.length > 0) {
        if (currentBuffer) {
          finalChunks.push(currentBuffer);
          currentBuffer = '';
        }
        finalChunks.push(...recursiveSplit(split, nextSeparators, targetSize));
        continue;
      }

      const joiner = currentBuffer ? separator : '';
      if (currentBuffer.length + joiner.length + split.length <= targetSize) {
        currentBuffer += joiner + split;
      } else {
        if (currentBuffer) finalChunks.push(currentBuffer);

        // Carry-over overlap from the last chunk.
        let overlapText = '';
        if (overlap > 0 && finalChunks.length > 0) {
          const lastChunk = finalChunks[finalChunks.length - 1];
          overlapText = lastChunk.slice(-overlap);
          const lastSepIdx = overlapText.lastIndexOf(separator);
          if (lastSepIdx !== -1) overlapText = overlapText.slice(lastSepIdx + separator.length);
        }

        currentBuffer = overlapText + (overlapText ? separator : '') + split;
      }
    }

    if (currentBuffer) finalChunks.push(currentBuffer);
    return finalChunks;
  }

  const allChunks = [];
  for (const section of sections) {
    const headerPrefix = section.header ? `[Section: ${section.header}]\n` : '';
    const effectiveSize = chunkSize - headerPrefix.length;
    const sectionChunks = recursiveSplit(section.content, separators, effectiveSize);
    sectionChunks.forEach((c) => allChunks.push(headerPrefix + c));
  }

  // Merge very small chunks with the previous one so they don't pollute retrieval.
  const processedChunks = [];
  let mergeBuffer = '';

  for (const chunk of allChunks) {
    if (mergeBuffer.length + chunk.length < chunkSize * 0.4) {
      mergeBuffer += (mergeBuffer ? '\n' : '') + chunk;
    } else {
      if (mergeBuffer) processedChunks.push(mergeBuffer);
      mergeBuffer = chunk;
    }
  }
  if (mergeBuffer) processedChunks.push(mergeBuffer);

  return processedChunks
    .filter((c) => c.trim().length > 60)
    .slice(0, 3000);
}

// ─── Embeddings ────────────────────────────────────────────────────────────

/**
 * Generates embeddings for a list of text chunks in batches of 100.
 *
 * @param {string[]} chunks
 * @param {string} apiKey
 * @returns {Promise<number[][]>}
 */
export async function generateEmbeddings(chunks, apiKey) {
  if (!apiKey) throw new Error('API key required for embeddings.');
  const ai = makeAI(apiKey);
  const batchSize = 100;
  const allEmbeddings = [];

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);

    const result = await withRetry(() =>
      ai.models.embedContent({
        model: 'gemini-embedding-exp-03-07',
        contents: batch,
      })
    );

    allEmbeddings.push(...result.embeddings.map((e) => e.values));

    // Throttle between batches — but only when there are more batches coming.
    if (i + batchSize < chunks.length) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  return allEmbeddings;
}

/**
 * Generates an embedding for a single query string.
 *
 * @param {string} query
 * @param {string} apiKey
 * @returns {Promise<number[]>}
 */
export async function generateQueryEmbedding(query, apiKey) {
  if (!apiKey) throw new Error('API key required for embeddings.');
  const ai = makeAI(apiKey);

  const result = await withRetry(() =>
    ai.models.embedContent({
      model: 'gemini-embedding-exp-03-07',
      contents: [query],
    })
  );

  return result.embeddings[0].values;
}

// ─── Retrieval ─────────────────────────────────────────────────────────────

/**
 * Cosine similarity between two equal-length numeric vectors.
 *
 * @param {number[]} vecA
 * @param {number[]} vecB
 * @returns {number}
 */
function cosineSimilarity(vecA, vecB) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// Fuse.js cache — keyed by a lightweight fingerprint of the chunks array.
let _fuseCache = null;
let _fuseCacheKey = '';

function getFuseInstance(chunks) {
  // Use length + first/last chunk as a cheap fingerprint.
  // This survives React re-renders that produce a new array reference.
  const key = `${chunks.length}:${chunks[0] ?? ''}:${chunks[chunks.length - 1] ?? ''}`;
  if (_fuseCache && _fuseCacheKey === key) return _fuseCache;

  _fuseCache = new Fuse(
    chunks.map((text, index) => ({ text, index })),
    { keys: ['text'], includeScore: true, threshold: 0.4 }
  );
  _fuseCacheKey = key;
  return _fuseCache;
}

/**
 * Hybrid (vector + fuzzy) retrieval — returns the topK most relevant chunks.
 *
 * @param {string} query
 * @param {number[]} queryEmbedding
 * @param {number[][]} chunkEmbeddings
 * @param {string[]} chunks
 * @param {number} [topK=5]
 * @returns {string[]}
 */
export function retrieveRelevantChunks(query, queryEmbedding, chunkEmbeddings, chunks, topK = 5) {
  if (!chunks?.length) return [];

  // 1. Vector similarity scores.
  const vectorScores = chunks.map((chunk, index) => ({
    chunk,
    index,
    vectorScore: queryEmbedding ? cosineSimilarity(queryEmbedding, chunkEmbeddings[index]) : 0,
  }));

  // 2. Fuzzy keyword scores.
  const fuse = getFuseInstance(chunks);
  const fuzzyResults = fuse.search(query);
  const fuzzyScores = new Map(fuzzyResults.map((r) => [r.item.index, 1 - r.score]));

  // 3. Combine: 80 % semantic + 20 % keyword.
  return vectorScores
    .map((item) => ({
      ...item,
      combinedScore: item.vectorScore * 0.8 + (fuzzyScores.get(item.index) ?? 0) * 0.2,
    }))
    .sort((a, b) => b.combinedScore - a.combinedScore)
    .slice(0, topK)
    .map((item) => item.chunk);
}

/**
 * Two-stage granular retrieval: coarse chunk retrieval → sentence-level re-ranking.
 * Falls back to coarse results if sentence embedding fails.
 *
 * @param {string} query
 * @param {number[]} queryEmbedding
 * @param {number[][]} chunkEmbeddings
 * @param {string[]} chunks
 * @param {string} apiKey
 * @param {number} [topK=5]
 * @returns {Promise<string[]>}
 */
export async function retrieveGranularContext(query, queryEmbedding, chunkEmbeddings, chunks, apiKey, topK = 5) {
  if (!chunks?.length) return [];

  // Stage 1: coarse retrieval — grab 3× as many candidates.
  const coarseChunks = retrieveRelevantChunks(query, queryEmbedding, chunkEmbeddings, chunks, topK * 3);

  // Stage 2: sentence-level re-ranking within the coarse results.
  const candidateSentences = coarseChunks.flatMap((chunk) =>
    nlp(chunk).sentences().json().map((s) => s.text)
  );

  const limitedSentences = candidateSentences
    .filter((s) => s.length > 20)
    .slice(0, 30);

  if (limitedSentences.length === 0) return coarseChunks.slice(0, topK);

  try {
    const sentenceEmbeddings = await generateEmbeddings(limitedSentences, apiKey);

    return limitedSentences
      .map((sentence, i) => ({
        sentence,
        score: cosineSimilarity(queryEmbedding, sentenceEmbeddings[i]),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map((s) => s.sentence);
  } catch (error) {
    console.error('Granular retrieval failed — falling back to coarse chunks:', error);
    return coarseChunks.slice(0, topK);
  }
}

// ─── Query utilities ───────────────────────────────────────────────────────

/**
 * Highlights query keywords within a text chunk using HTML <mark> tags.
 * Special regex characters in keywords are escaped to prevent errors.
 *
 * @param {string} text
 * @param {string} query
 * @returns {string}
 */
export function highlightKeywords(text, query) {
  if (!query) return text;

  const stopWords = new Set([
    'the','a','an','and','or','but','is','are','was','were','to','in',
    'on','at','by','for','with','about','against','between','into',
    'through','during','before','after','above','below','from','up',
    'down','out','off','over','under','again','further','then','once',
  ]);

  const keywords = query
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 2 && !stopWords.has(w))
    // Escape special regex characters so queries like "C++" don't throw.
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

  if (keywords.length === 0) return text;

  const pattern = new RegExp(`(${keywords.join('|')})`, 'gi');
  return text.replace(
    pattern,
    '<mark class="bg-yellow-200 text-yellow-900 px-0.5 rounded">$1</mark>'
  );
}

/**
 * Rephrases a query into a standalone question using conversation history,
 * so that the embedding search is context-aware even in multi-turn chats.
 *
 * @param {string} query
 * @param {Array<{ sender: string, text: string }>} history
 * @param {string} apiKey
 * @returns {Promise<string>}
 */
export async function rephraseQuery(query, history, apiKey) {
  if (!apiKey || history.length === 0) return query;
  const ai = makeAI(apiKey);

  const chatHistory = history
    .slice(-4)
    .map((m) => `${m.sender === 'user' ? 'User' : 'Assistant'}: ${m.text}`)
    .join('\n');

  try {
    const response = await withRetry(() =>
      ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: [{
          role: 'user',
          parts: [{
            text: `Given the conversation history and a new user query, rephrase the query into a standalone question suitable for a document search engine.
Include all necessary context from the history.
If the query is already standalone, return it unchanged.
Return ONLY the rephrased query string.

HISTORY:
${chatHistory}

NEW QUERY:
"${query}"`,
          }],
        }],
        config: { temperature: 0.1 },
      })
    );

    return response.text.trim().replace(/^"|"$/g, '');
  } catch (error) {
    console.error('rephraseQuery error:', error);
    return query;
  }
}

/**
 * Autocorrects and refines a user query for document search.
 *
 * @param {string} query
 * @param {string} apiKey
 * @returns {Promise<string>}
 */
export async function autocorrectQuery(query, apiKey) {
  if (!apiKey || query.length < 3) return query;
  const ai = makeAI(apiKey);

  try {
    const response = await withRetry(() =>
      ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: [{
          role: 'user',
          parts: [{
            text: `Autocorrect and refine the following query for a document search system.
If it's already clear and correct, return it unchanged.
Return ONLY the corrected query string.

QUERY: "${query}"`,
          }],
        }],
        config: { temperature: 0.1 },
      })
    );

    return response.text.trim().replace(/^"|"$/g, '');
  } catch (error) {
    console.error('autocorrectQuery error:', error);
    return query;
  }
}
