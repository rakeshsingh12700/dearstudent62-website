import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
// import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyC057ArCgx829IG-_FeklWEdSxwGUs-OcI",
  authDomain: "dearstudent62-worksheets.firebaseapp.com",
  projectId: "dearstudent62-worksheets",
  storageBucket: "dearstudent62-worksheets.firebasestorage.app",
  messagingSenderId: "348565027764",
  appId: "1:348565027764:web:53f0e280f6e6fdaed410e1",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// ✅ EXPORT BOTH
export const auth = getAuth(app);
export const db = getFirestore(app);