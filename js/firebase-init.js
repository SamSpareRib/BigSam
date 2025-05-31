// 导入 Firebase v9+ SDK 中的 initializeApp 函数
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js"; // 请使用最新稳定版SDK


// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBp0cpyI-cosN_UoLprRMvoSnWV2IVV7S4",
  authDomain: "ai-feedback-5d7d3.firebaseapp.com",
  projectId: "ai-feedback-5d7d3",
  storageBucket: "ai-feedback-5d7d3.firebasestorage.app",
  messagingSenderId: "781187851881",
  appId: "1:781187851881:web:ed890ddcf790d3766364f8"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// 在这里，我们也可以提前获取并导出 Auth 和 Firestore 服务实例
// 这样其他模块可以直接从 firebase-init.js 导入它们
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const auth = getAuth(app);
const db = getFirestore(app);

export { auth, db, app };