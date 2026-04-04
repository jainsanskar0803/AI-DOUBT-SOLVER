/**
 * Sophisticated retrieval service using Gemini Vector Embeddings.
 */

import * as pdfjs from 'pdfjs-dist';
import { GoogleGenAI } from '@google/genai';
import mammoth from 'mammoth';
import nlp from 'compromise';
import Fuse from 'fuse.js';
import { withRetry } from './apiUtils';

// Polyfill Promise.try for environments where it's missing
if (typeof Promise.try !== 'function') {
  Promise.try = function(fn, ...args) {
    return new Promise((resolve, reject) => {
      try {
        resolve(fn(...args));
      } catch (err) {
        reject(err);
      }
    });
  };
}

// Use the Vite-compatible way to load the worker
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

/**
 * Extracts text from a PDF file efficiently using parallel page processing.
 */
export async function extractTextFromPDF(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  
  const pagePromises = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    pagePromises.push(
      pdf.getPage(i).then(async (page) => {
        const textContent = await page.getTextContent();
        let lastY, text = '';
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
  return pages.join('\n\n');
}

/**
 * Extracts text from a DOCX file using mammoth.
 */
export async function extractTextFromDocx(file) {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

/**
 * Extracts HTML from a DOCX file using mammoth for preview.
 */
export async function extractHtmlFromDocx(file) {
  const arrayBuffer = await file.arrayBuffer();
  const options = {
    styleMap: [
      "p[style-name='Center'] => p.text-center",
      "p[style-name='Right'] => p.text-right",
      "p[style-name='Justify'] => p.text-justify",
      "p[style-name='Heading 1'] => h1:fresh",
      "p[style-name='Heading 2'] => h2:fresh",
      "p[style-name='Heading 3'] => h3:fresh",
    ]
  };
  const result = await mammoth.convertToHtml({ arrayBuffer }, options);
  return result.value;
}

/**
 * Generic text extraction function for PDF and DOCX.
 */
export async function extractText(file) {
  const extension = file.name.split('.').pop().toLowerCase();
  if (extension === 'pdf') {
    return extractTextFromPDF(file);
  } else if (extension === 'docx') {
    return extractTextFromDocx(file);
  } else {
    throw new Error('Unsupported file format. Please upload PDF or DOCX.');
  }
}

/**
 * Calculates content density and other metrics to determine optimal chunking.
 * Refined to be more adaptive and experimental with sizes based on content type.
 */
function getOptimalChunkParams(text) {
  const length = text.length;
  
  // For very small documents, use very small chunks for high granularity
  if (length < 2000) return { chunkSize: 300, overlap: 50 };

  // Density: Punctuation and special characters (indicates information density)
  const punctuation = (text.match(/[.,!?;:()\[\]{}"']/g) || []).length;
  const density = punctuation / length;

  // Complexity: Average word length (technical text often has longer words)
  const words = text.trim().split(/\s+/);
  const avgWordLen = length / (words.length || 1);

  // Determine "Content Type"
  const isTechnical = avgWordLen > 6.5 || density > 0.04;
  const isNarrative = avgWordLen < 5.5 && density < 0.02;

  // Base chunk size scales with document length
  let baseSize = 800; // Default starting point for better granularity
  
  if (length > 500000) {
    baseSize = 1500; // Large document: larger chunks for coherence
  } else if (length > 100000) {
    baseSize = 1200; 
  } else if (length < 20000) {
    baseSize = 600;  // Small document: smaller chunks for precision
  }

  // Adjust based on content type
  if (isTechnical) {
    // Technical content needs smaller chunks to avoid mixing distinct technical concepts
    baseSize *= 0.85;
  } else if (isNarrative) {
    // Narrative content benefits from larger chunks to maintain story/context flow
    baseSize *= 1.25;
  }

  // Experimental: Adjust overlap based on density
  // High density -> more likely to have cross-sentence dependencies -> higher overlap
  let overlapPercentage = 0.15;
  if (density > 0.045) overlapPercentage = 0.25;
  if (density < 0.015) overlapPercentage = 0.10;

  const chunkSize = Math.floor(baseSize);
  const overlap = Math.floor(chunkSize * overlapPercentage);

  return { chunkSize, overlap };
}

/**
 * Detects structural headings in text using heuristics.
 */
function detectHeadings(text) {
  const lines = text.split('\n');
  const headings = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.length === 0) continue;
    
    // Heuristics for a heading:
    // 1. Short line (less than 80 chars)
    // 2. Starts with a numbering pattern (1., 1.1, Section A)
    // 3. All caps (if longer than 3 chars)
    // 4. Ends with a colon (often a sub-heading)
    
    const isShort = line.length < 80;
    const isNumbered = /^(?:(?:Section|Chapter|Part)\s+)?(?:\d+(?:\.\d+)*|[A-Z])[\s.:]/.test(line);
    const isAllCaps = line.length > 3 && line === line.toUpperCase() && /[A-Z]/.test(line);
    const endsWithColon = line.endsWith(':') && line.length < 50;
    
    if (isShort && (isNumbered || isAllCaps || endsWithColon)) {
      headings.push({
        text: line,
        lineIndex: i,
        type: isNumbered ? 'numbered' : (isAllCaps ? 'caps' : 'sub')
      });
    }
  }
  
  return headings;
}

/**
 * Chunks text into smaller pieces for retrieval using a recursive strategy.
 * Enhanced to be structure-aware, maintaining semantic coherence by respecting headings.
 */
export function chunkText(text) {
  const { chunkSize, overlap } = getOptimalChunkParams(text);
  const headings = detectHeadings(text);
  
  // Create sections based on headings
  const sections = [];
  if (headings.length === 0) {
    sections.push({ header: "", content: text });
  } else {
    const lines = text.split('\n');
    let currentHeader = "Introduction";
    let currentContent = [];
    let headingIdx = 0;
    
    for (let i = 0; i < lines.length; i++) {
      if (headingIdx < headings.length && headings[headingIdx].lineIndex === i) {
        // New section starts
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

  // Separators in order of preference
  // We avoid splitting on characters that are common in math/equations if possible
  const separators = ["\n\n", "\n", "; ", ". ", "! ", "? ", ", ", " ", ""];
  
  function recursiveSplit(text, currentSeparators, targetSize) {
    if (text.length <= targetSize) return [text];
    
    const separator = currentSeparators[0];
    const nextSeparators = currentSeparators.slice(1);
    
    // Heuristic: If a line looks like an equation (contains =, +, -, *, /, ^, or LaTeX symbols), 
    // try to keep it together by not splitting on spaces within it if it's already small enough.
    const splits = text.split(separator);
    const finalChunks = [];
    let currentBuffer = "";
    
    for (let i = 0; i < splits.length; i++) {
      let split = splits[i];
      
      // If we're splitting on spaces but the split contains math-like characters, 
      // we might want to be more careful, but recursive split already handles this by trying larger separators first.
      
      if (split.length > targetSize && nextSeparators.length > 0) {
        if (currentBuffer) {
          finalChunks.push(currentBuffer);
          currentBuffer = "";
        }
        const subChunks = recursiveSplit(split, nextSeparators, targetSize);
        finalChunks.push(...subChunks);
        continue;
      }
      
      const joiner = (currentBuffer ? separator : "");
      if (currentBuffer.length + joiner.length + split.length <= targetSize) {
        currentBuffer += joiner + split;
      } else {
        if (currentBuffer) finalChunks.push(currentBuffer);
        
        // Overlap logic
        let overlapText = "";
        if (overlap > 0 && finalChunks.length > 0) {
          const lastChunk = finalChunks[finalChunks.length - 1];
          overlapText = lastChunk.slice(-overlap);
          const lastSepIndex = overlapText.lastIndexOf(separator);
          if (lastSepIndex !== -1) {
            overlapText = overlapText.slice(lastSepIndex + separator.length);
          }
        }
        
        currentBuffer = overlapText + (overlapText ? separator : "") + split;
      }
    }
    
    if (currentBuffer) finalChunks.push(currentBuffer);
    return finalChunks;
  }

  const allChunks = [];
  for (const section of sections) {
    // Prepend header to each chunk in the section to maintain context
    const headerPrefix = section.header ? `[Section: ${section.header}]\n` : "";
    const effectiveChunkSize = chunkSize - headerPrefix.length;
    
    const sectionChunks = recursiveSplit(section.content, separators, effectiveChunkSize);
    
    for (const chunk of sectionChunks) {
      allChunks.push(headerPrefix + chunk);
    }
  }
  
  // Post-processing: merge very small chunks
  const processedChunks = [];
  let mergeBuffer = "";
  
  for (const chunk of allChunks) {
    if ((mergeBuffer.length + chunk.length) < (chunkSize * 0.4)) {
      mergeBuffer += (mergeBuffer ? "\n" : "") + chunk;
    } else {
      if (mergeBuffer) processedChunks.push(mergeBuffer);
      mergeBuffer = chunk;
    }
  }
  if (mergeBuffer) processedChunks.push(mergeBuffer);
  
  return processedChunks
    .filter(c => c.trim().length > 60)
    .slice(0, 3000);
}

/**
 * Advanced retrieval that zooms in on specific sentences within relevant chunks.
 * This implements a "Small-to-Big" retrieval pattern.
 */
export async function retrieveGranularContext(query, queryEmbedding, chunkEmbeddings, chunks, apiKey, topK = 5) {
  if (!chunks || chunks.length === 0) return [];

  // 1. Coarse retrieval: get top chunks using existing hybrid search
  const coarseChunks = retrieveRelevantChunks(query, queryEmbedding, chunkEmbeddings, chunks, topK * 3);
  
  // 2. Granular analysis: split top chunks into sentences
  const candidateSentences = [];
  for (const chunk of coarseChunks) {
    // Use compromise for sentence splitting
    const sentences = nlp(chunk).sentences().json().map(s => s.text);
    candidateSentences.push(...sentences);
  }
  
  // 3. Embed sentences (only for top chunks to save API calls and latency)
  // Limit to top 30 sentences to keep performance high
  const limitedSentences = candidateSentences
    .filter(s => s.length > 20)
    .slice(0, 30);
    
  if (limitedSentences.length === 0) return coarseChunks.slice(0, topK);

  try {
    const sentenceEmbeddings = await generateEmbeddings(limitedSentences, apiKey);
    
    // 4. Find most relevant sentences within the relevant chunks
    const sentenceScores = limitedSentences.map((sentence, index) => {
      const similarity = cosineSimilarity(queryEmbedding, sentenceEmbeddings[index]);
      return { sentence, similarity };
    });
    
    const topSentences = sentenceScores
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
      
    // 5. Return the top sentences as the most granular context
    return topSentences.map(s => s.sentence);
  } catch (error) {
    console.error('Granular retrieval failed, falling back to coarse chunks:', error);
    return coarseChunks.slice(0, topK);
  }
}

/**
 * Calculates cosine similarity between two vectors.
 */
function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Generates embeddings for a list of text chunks.
 */
export async function generateEmbeddings(chunks, apiKey) {
  if (!apiKey) throw new Error('API Key required for embeddings');
  const ai = new GoogleGenAI({ apiKey });
  
  const batchSize = 100;
  const allEmbeddings = [];
  
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    
    // Process each batch sequentially to respect rate limits
    const result = await withRetry(() => 
      ai.models.embedContent({
        model: 'gemini-embedding-2-preview',
        contents: batch,
      })
    );
    
    allEmbeddings.push(...result.embeddings.map(e => e.values));
    
    // Small delay between batches to be safe
    if (i + batchSize < chunks.length) {
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
  
  return allEmbeddings;
}

/**
 * Generates embedding for a single query.
 */
export async function generateQueryEmbedding(query, apiKey) {
  if (!apiKey) throw new Error('API Key required for embeddings');
  const ai = new GoogleGenAI({ apiKey });
  
  const result = await withRetry(() => 
    ai.models.embedContent({
      model: 'gemini-embedding-2-preview',
      contents: [query],
    })
  );
  
  return result.embeddings[0].values;
}

let cachedFuse = null;
let cachedChunks = null;

/**
 * Hybrid vector-based and fuzzy retrieval.
 * Finds the most relevant chunks for a given query.
 */
export function retrieveRelevantChunks(query, queryEmbedding, chunkEmbeddings, chunks, topK = 5) {
  if (!chunks || chunks.length === 0) return [];

  // 1. Vector Search (Semantic)
  const vectorScores = chunks.map((chunk, index) => {
    const similarity = queryEmbedding ? cosineSimilarity(queryEmbedding, chunkEmbeddings[index]) : 0;
    return { chunk, index, vectorScore: similarity };
  });

  // 2. Fuzzy Search (Keyword-based)
  // Cache Fuse instance to avoid re-indexing on every query
  if (!cachedFuse || cachedChunks !== chunks) {
    cachedFuse = new Fuse(chunks.map((text, index) => ({ text, index })), {
      keys: ['text'],
      includeScore: true,
      threshold: 0.4,
    });
    cachedChunks = chunks;
  }
  
  const fuzzyResults = cachedFuse.search(query);
  const fuzzyScores = new Map(fuzzyResults.map(res => [res.item.index, 1 - res.score]));

  // 3. Combine Scores (Hybrid)
  const hybridResults = vectorScores.map(item => {
    const fuzzyScore = fuzzyScores.get(item.index) || 0;
    // Weighted average: 80% vector, 20% fuzzy
    const combinedScore = (item.vectorScore * 0.8) + (fuzzyScore * 0.2);
    return { ...item, combinedScore };
  });

  return hybridResults
    .sort((a, b) => b.combinedScore - a.combinedScore)
    .slice(0, topK)
    .map(item => item.chunk);
}

/**
 * Autocorrects a user query using Gemini.
 */
export async function autocorrectQuery(query, apiKey) {
  if (!apiKey || query.length < 3) return query;
  const ai = new GoogleGenAI({ apiKey });
  
  try {
    const response = await withRetry(() => 
      ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [{
          role: 'user',
          parts: [{
            text: `Autocorrect and refine the following user query for a document search system. 
            If it's already clear, return it as is. 
            Return ONLY the corrected query string.
            
            QUERY: "${query}"`
          }]
        }],
        config: {
          temperature: 0.1,
        }
      })
    );
    
    return response.text.trim().replace(/^"|"$/g, '');
  } catch (error) {
    console.error('Autocorrect error:', error);
    return query;
  }
}

/**
 * Highlights keywords within a text chunk.
 */
export function highlightKeywords(text, query) {
  if (!query) return text;
  
  // Extract keywords from query (simple split, ignoring common words)
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'to', 'in', 'on', 'at', 'by', 'for', 'with', 'about', 'against', 'between', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'from', 'up', 'down', 'out', 'off', 'over', 'under', 'again', 'further', 'then', 'once']);
  const keywords = query.toLowerCase()
    .split(/\W+/)
    .filter(word => word.length > 2 && !stopWords.has(word));
    
  if (keywords.length === 0) return text;
  
  // Create a regex to match any of the keywords
  const pattern = new RegExp(`(${keywords.join('|')})`, 'gi');
  
  // Replace with marked version
  return text.replace(pattern, '<mark class="bg-yellow-200 text-yellow-900 px-0.5 rounded">$1</mark>');
}

/**
 * Rephrases a user query based on conversation history to create a standalone query for RAG.
 */
export async function rephraseQuery(query, history, apiKey) {
  if (!apiKey || history.length === 0) return query;
  const ai = new GoogleGenAI({ apiKey });

  try {
    const chatHistory = history.slice(-4).map(msg => `${msg.sender === 'user' ? 'User' : 'Assistant'}: ${msg.text}`).join('\n');
    
    const response = await withRetry(() => 
      ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [{
          role: 'user',
          parts: [{
            text: `Given the following conversation history and a new user query, rephrase the query into a standalone question that can be used for a document search. 
            The standalone question should contain all necessary context from the history.
            If the query is already a standalone question or doesn't depend on history, return it as is.
            Return ONLY the rephrased query string.

            HISTORY:
            ${chatHistory}

            NEW QUERY:
            "${query}"`
          }]
        }],
        config: {
          temperature: 0.1,
        }
      })
    );
    
    return response.text.trim().replace(/^"|"$/g, '');
  } catch (error) {
    console.error('Rephrase error:', error);
    return query;
  }
}
