// src/Login.js
import React from 'react';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth } from './firebase';

const Login = () => {
  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error('로그인 실패', err);
    }
  };

  return (
    <div>
      <h2>로그인이 필요합니다</h2>
      <button onClick={handleLogin}>Google 로그인</button>
    </div>
  );
};

export default Login;
