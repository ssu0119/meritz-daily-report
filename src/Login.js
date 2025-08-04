// src/Login.js
import React, { useState, useEffect } from 'react';
import { signInWithPopup, GoogleAuthProvider, getAuth, onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';
import { useNavigate } from 'react-router-dom';

const Login = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);

  // 이미 로그인되어 있으면 바로 홈으로 이동
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        console.log('이미 로그인됨:', user.email);
        navigate('/', { replace: true });
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  const handleLogin = async () => {
    setIsLoading(true);
    const provider = new GoogleAuthProvider();
    
    try {
      console.log('🔄 로그인 시도 중...');
      const result = await signInWithPopup(auth, provider);
      console.log('✅ 로그인 성공:', result.user.email);
      
      console.log('🔄 페이지 리다이렉트 시도...');
      console.log('현재 URL:', window.location.href);

      window.location.href = '/';

      console.log('✅ 리다이렉트 명령 실행됨');

    } catch (err) {
      console.error('❌ 로그인 실패:', err);
      console.error('에러 코드:', err.code);
      console.error('에러 메시지:', err.message);
      
      // 더 자세한 에러 메시지
      let errorMessage = '로그인에 실패했습니다.';
      if (err.code === 'auth/popup-closed-by-user') {
        errorMessage = '로그인 창이 닫혔습니다. 다시 시도해주세요.';
      } else if (err.code === 'auth/popup-blocked') {
        errorMessage = '팝업이 차단되었습니다. 팝업 차단을 해제해주세요.';
      } else if (err.code === 'auth/operation-not-allowed') {
        errorMessage = 'Google 로그인이 활성화되지 않았습니다. Firebase 설정을 확인해주세요.';
      }
      
      alert(errorMessage);
      setIsLoading(false);
    }
  };

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center',
      minHeight: '100vh',
      backgroundColor: '#f8fafc'
    }}>
      <div style={{
        backgroundColor: 'white',
        padding: '40px',
        borderRadius: '12px',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        textAlign: 'center'
      }}>
        <h1 style={{ 
          fontSize: '24px',
          fontWeight: 'bold',
          color: '#1f2937',
          marginBottom: '8px'
        }}>
          메리츠화재 리포트 플랫폼
        </h1>
        <h2 style={{ 
          fontSize: '16px',
          color: '#6b7280',
          marginBottom: '32px'
        }}>
          로그인이 필요합니다
        </h2>
        
        <button
          onClick={handleLogin}
          disabled={isLoading}
          style={{
            padding: '12px 24px',
            backgroundColor: isLoading ? '#9ca3af' : '#4285F4',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: isLoading ? 'not-allowed' : 'pointer',
            fontSize: '16px',
            fontWeight: '500',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            margin: '0 auto'
          }}
        >
          {isLoading ? (
            <>
              <div style={{
                width: '16px',
                height: '16px',
                border: '2px solid white',
                borderTop: '2px solid transparent',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }}></div>
              로그인 중...
            </>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Google 로그인
            </>
          )}
        </button>
        
        {isLoading && (
          <p style={{
            fontSize: '14px',
            color: '#6b7280',
            marginTop: '16px'
          }}>
            Google 로그인 창이 열렸습니다. 팝업을 확인해주세요.
          </p>
        )}
      </div>
      
      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default Login;