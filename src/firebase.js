// src/firebase.js
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBXxuHztfDeDBRS3EhduPKwz7njRdLzN7U",
  authDomain: "meritz-daily-report.firebaseapp.com",
  projectId: "meritz-daily-report",
  storageBucket: "meritz-daily-report.firebasestorage.app",
  messagingSenderId: "385447521254",
  appId: "1:385447521254:web:b33e1bd9b28a9fd92bc427"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();
export const db = getFirestore(app);