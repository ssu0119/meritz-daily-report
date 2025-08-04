// src/Home.js
import React, { useEffect, useState } from 'react';
import { auth, db } from './firebase';
import { collection, onSnapshot } from 'firebase/firestore';

function Home() {
  const [reports, setReports] = useState([]);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'dailyReports'),
      (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setReports(data);
      },
      (error) => {
        console.error('데이터 불러오기 실패:', error);
      }
    );
    return () => unsubscribe();
  }, []);

  return (
    <div>
      <h2>리포트 목록</h2>
      {reports.map((r) => (
        <div key={r.id}>{r.title || '제목 없음'}</div>
      ))}
    </div>
  );
}

export default Home;
