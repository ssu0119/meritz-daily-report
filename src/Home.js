import React, { useEffect, useState } from 'react';
import { auth, db } from './firebase';
import { collection, onSnapshot, addDoc } from 'firebase/firestore';

function Home() {
  const [reports, setReports] = useState([]);
  const [input, setInput] = useState('');

  useEffect(() => {
    if (!auth.currentUser) {
      console.warn('로그인한 사용자 없음');
      return;
    }

    const unsubscribe = onSnapshot(
      collection(db, 'dailyReports'),
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setReports(data);
      },
      (error) => {
        console.error('데이터 구독 오류:', error);
      }
    );

    return () => unsubscribe();
  }, []);

  const handleAdd = async () => {
    if (!input) return;

    if (!auth.currentUser) {
      alert('로그인이 필요합니다.');
      return;
    }

    try {
      await addDoc(collection(db, 'dailyReports'), {
        text: input,
        createdAt: new Date(),
        userId: auth.currentUser.uid,
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
