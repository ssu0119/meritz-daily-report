import React, { useEffect, useState } from 'react';
import { auth, db } from './firebase';
import { collection, onSnapshot, addDoc } from 'firebase/firestore';

function Home() {
  const [reports, setReports] = useState([]);
  const [input, setInput] = useState('');

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'dailyReports'), (snapshot) => {
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setReports(data);
    });

    return () => unsubscribe();
  }, []);

  const handleAdd = async () => {
    if (!input) return;
    try {
      await addDoc(collection(db, 'dailyReports'), {
        text: input,
        createdAt: new Date(),
        userId: auth.currentUser?.uid || null,
      });
      setInput('');
    } catch (error) {
      console.error('추가 실패:', error.message);
    }
  };

  return (
    <div>
      <h2>리포트 목록</h2>
      <ul>
        {reports.map((item) => (
          <li key={item.id}>{item.text}</li>
        ))}
      </ul>
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="리포트 입력"
      />
      <button onClick={handleAdd}>추가</button>
    </div>
  );
}

export default Home;
