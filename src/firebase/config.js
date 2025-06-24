import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyArCQ0KBzvHjaWo25LPF3lG380URQr3uNU", 
    authDomain: "fir-portfolio-analyst.web.app", // Use your Firebase Hosting domain
    projectId: "portfolio-and-options-analysis",
    storageBucket: "portfolio-and-options-analysis.appspot.com",
    messagingSenderId: "835503184366",
    appId: "1:835503184366:web:765da6e2c49258cf5696ff",
    measurementId: "G-BB4TWS8RQ7"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const appId = "portfolio-and-options-analysis";
