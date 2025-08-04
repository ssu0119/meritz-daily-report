// src/Home.js
import React, { useEffect, useState } from 'react';
import { auth, db } from './firebase';
import { signOut } from 'firebase/auth';
import { collection, addDoc, onSnapshot } from 'firebase/firestore';

export default function Home() {
  const [reports, setReports] = useState([]);
  const [newReport, setNewReport] = useState('');

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'dailyReports'), (snapshot) => {
      const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setReports(data);
    });
    return () => unsubscribe();
  }, []);

  const handleAdd = async () => {
    await addDoc(collection(db, 'dailyReports'), {
      text: newReport,
      createdAt: new Date(),
      author: auth.currentUser.email,
    });
    setNewReport('');
  };

  return (
    <div style={{ padding: 20 }}>
      <h2>데일리 리포트</h2>
      <input
        value={newReport}
        onChange={(e) => setNewReport(e.target.value)}
        placeholder="내용 입력"
      />
      <button onClick={handleAdd}>추가</button>
      <ul>
        {reports.map((r) => (
          <li key={r.id}>
            {r.text} ({r.author})
          </li>
        ))}
      </ul>
      <button onClick={() => signOut(auth)}>로그아웃</button>
    </div>
  );
}
