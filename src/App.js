// src/App.js
import React, { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';
import Login from './Login';
import Home from './Home';

function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      console.log('로그인 상태:', firebaseUser);
      setUser(firebaseUser);
      setChecking(false);
    });
    return () => unsub();
  }, []);

  if (checking) return <div>로딩 중...</div>;

  return <>{user ? <Home /> : <Login />}</>;
}

export default App;
