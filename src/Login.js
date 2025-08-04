// src/Login.js
import React from 'react';
import { signInWithPopup } from 'firebase/auth';
import { auth, provider } from './firebase';

export default function Login() {
  const handleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, provider);
      alert(`${result.user.email} 로그인 성공`);
    } catch (err) {
      console.error(err);
      alert('로그인 실패');
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', marginTop: '20%' }}>
      <button onClick={handleLogin}>Google 계정으로 로그인</button>
    </div>
  );
}
