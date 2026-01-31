import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
    apiKey: "AIzaSyAI0JZbtQDLlK9m2eiE77cEzlmOkn9Kwdk",
    authDomain: "jnis-cloud-project.firebaseapp.com",
    databaseURL: "https://jnis-cloud-project-default-rtdb.firebaseio.com",
    projectId: "jnis-cloud-project",
    storageBucket: "jnis-cloud-project.firebasestorage.app",
    messagingSenderId: "11114016150",
    appId: "1:11114016150:web:a2a2fc4e9d475c2119c1b7",
    measurementId: "G-ZWH8EKV6RP"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);
export default app;
