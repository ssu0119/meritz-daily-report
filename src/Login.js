// src/Login.js
import React from 'react';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth } from './firebase';
import { useNavigate } from 'react-router-dom';

const Login = () => {
  const navigate = useNavigate();

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      console.log('로그인한 사용자:', result.user);
      navigate('/'); // 로그인 성공 시 홈으로 이동
    } catch (err) {
      console.error('로그인 실패', err);
      alert('로그인에 실패했습니다. 콘솔을 확인해주세요.');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '100px' }}>
      <h2 style={{ marginBottom: '20px' }}>로그인이 필요합니다</h2>
      <button
        onClick={handleLogin}
        style={{
          padding: '12px 24px',
          backgroundColor: '#4285F4',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          fontSize: '16px',
        }}
      >
        Google 로그인
      </button>
    </div>
  );
};

export default Login;
