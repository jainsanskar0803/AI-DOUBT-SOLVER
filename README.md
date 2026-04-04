# AI Book Doubt Solver

AI Book Doubt Solver is a powerful, context-aware learning assistant that allows students and researchers to upload PDF books, notes, or documents and get instant, AI-powered answers based on the content. It leverages advanced language models to provide deep insights, summaries, and explanations for complex topics.

## 🚀 Key Features

- **PDF Intelligence**: Upload PDF documents and ask questions directly from the content.
- **Context-Aware Chat**: Get answers that are grounded in your specific study materials.
- **Multi-Format Support**: Works with PDFs, notes, and various document types.
- **Real-Time Sync**: Powered by Firebase for real-time data persistence and user authentication.
- **Secure Authentication**: Google and Email/Password authentication for a personalized experience.
- **Responsive Design**: Polished, modern UI built with Tailwind CSS and Framer Motion.

## 🛠️ Tech Stack

- **Frontend**: React 19, Vite, Tailwind CSS
- **Backend/Database**: Firebase (Authentication, Firestore)
- **AI Engine**: Google Gemini API (`@google/genai`)
- **Animations**: Framer Motion
- **Icons**: Lucide React
- **Notifications**: Sonner (Toast notifications)
- **PDF Processing**: `pdfjs-dist`, `pdf-parse`

## 📋 Prerequisites

Before you begin, ensure you have the following:

- **Node.js**: Version 18 or higher.
- **Firebase Project**: A Firebase project with Authentication (Google & Email) and Firestore enabled.
- **Gemini API Key**: An API key from Google AI for the Gemini model.

## ⚙️ Installation & Setup

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd ai-book-doubt-solver
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Create a `.env` file in the root directory and add the following:
   ```env
   VITE_GEMINI_API_KEY=your_gemini_api_key
   VITE_APP_URL=http://localhost:3000
   ```

4. **Firebase Configuration**:
   Ensure your `firebase-applet-config.json` (or equivalent configuration in `src/firebase.ts`) contains your Firebase project credentials:
   ```json
   {
     "apiKey": "YOUR_API_KEY",
     "authDomain": "YOUR_AUTH_DOMAIN",
     "projectId": "YOUR_PROJECT_ID",
     "storageBucket": "YOUR_STORAGE_BUCKET",
     "messagingSenderId": "YOUR_MESSAGING_SENDER_ID",
     "appId": "YOUR_APP_ID",
     "firestoreDatabaseId": "(default)"
   }
   ```

5. **Start the development server**:
   ```bash
   npm run dev
   ```

6. **Build for production**:
   ```bash
   npm run build
   ```

## 🔐 Security Rules

The application uses Firestore Security Rules to ensure data privacy. Users can only access their own profiles and chat history. Make sure to deploy the `firestore.rules` file to your Firebase project.

## 📄 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

---

Built with ❤️ for learners everywhere.
