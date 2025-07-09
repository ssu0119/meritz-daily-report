import React, { useState, useEffect } from 'react';
import { db } from './firebase';
import { doc, setDoc, getDoc, collection, getDocs, serverTimestamp } from 'firebase/firestore';

// Firebase 기본 저장 함수
const saveToFirebase = async (date, reportData) => {
  try {
    const docRef = doc(db, 'dailyReports', date);
    await setDoc(docRef, { 
      ...reportData, 
      lastUpdated: serverTimestamp(), 
      lastUpdatedBy: reportData.senderName 
    });
    
    console.log('Firebase 저장 완료:', date, reportData);
    return true;
  } catch (error) {
    console.error('Firebase 저장 실패:', error);
    return false;
  }
};

// 🛡️ 진짜 안전한 섹션별 병합 시스템
const realSafeSaveToFirebase = async (date, localData, updatedSection, senderName) => {
  const maxRetries = 5;
  let retryCount = 0;
  
  while (retryCount < maxRetries) {
    try {
      console.log(`🛡️ 진짜 안전한 저장 시도 ${retryCount + 1}/${maxRetries}:`, { date, updatedSection, senderName });
      
      // 1. 항상 최신 서버 데이터 불러오기
      const docRef = doc(db, 'dailyReports', date);
      const docSnap = await getDoc(docRef);
      
      let serverData = null;
      if (docSnap.exists()) {
        serverData = docSnap.data();
        console.log('📥 서버 데이터 로드됨');
      }
      
      // 2. 병합 데이터 생성
      let mergedData;
      
      if (!serverData) {
        // 서버에 데이터가 없는 경우 - 로컬 데이터로 새로 생성
        mergedData = JSON.parse(JSON.stringify(localData));
        mergedData.version = 1;
        console.log('🆕 새 문서 생성');
      } else {
        // 서버 데이터 기반으로 병합 시작
        mergedData = JSON.parse(JSON.stringify(serverData));
        
        // 🔥 핵심: 수정된 섹션만 교체, 나머지는 서버 데이터 유지
        if (updatedSection === 'daOverall') {
          mergedData.daOverall = JSON.parse(JSON.stringify(localData.daOverall));
          console.log('🔄 DA전체만 업데이트 (다른 섹션은 서버 데이터 유지)');
        } else if (updatedSection === 'partnership') {
          mergedData.partnership = JSON.parse(JSON.stringify(localData.partnership));
          console.log('🔄 제휴만 업데이트 (다른 섹션은 서버 데이터 유지)');
        } else if (updatedSection === 'attachmentNote') {
          mergedData.attachmentNote = localData.attachmentNote;
          console.log('🔄 첨부파일 안내만 업데이트 (다른 섹션은 서버 데이터 유지)');
        } else if (updatedSection.startsWith('media_')) {
          // 개별 매체만 업데이트
          const mediaName = updatedSection.replace('media_', '');
          if (!mergedData.mediaDetails) {
            mergedData.mediaDetails = {};
          }
          // 🔥 핵심: 해당 매체만 교체, 다른 매체는 서버 데이터 유지
          mergedData.mediaDetails[mediaName] = JSON.parse(JSON.stringify(localData.mediaDetails[mediaName]));
          console.log(`🔄 ${mediaName}만 업데이트 (다른 매체는 서버 데이터 유지)`);
        } else if (updatedSection === 'senderName') {
          mergedData.senderName = localData.senderName;
          console.log('🔄 보내는 사람만 업데이트');
        }
        
        // 버전 증가
        mergedData.version = (serverData.version || 0) + 1;
        console.log(`📊 버전 증가: ${serverData.version || 0} → ${mergedData.version}`);
      }
      
      // 3. 기본 메타데이터 업데이트
      mergedData.date = date;
      mergedData.lastUpdated = serverTimestamp();
      mergedData.lastUpdatedBy = senderName;
      mergedData.lastUpdatedSection = updatedSection;
      mergedData.lastUpdatedTime = new Date().toISOString();
      
      // 4. 저장
      await setDoc(docRef, mergedData);
      
      console.log('✅ 진짜 안전한 저장 완료:', { 
        version: mergedData.version, 
        updatedSection,
        preservedSections: '다른 섹션은 서버 데이터 유지됨'
      });
      
      return { success: true, mergedData };
      
    } catch (error) {
      console.error(`❌ 저장 실패 (시도 ${retryCount + 1}):`, error);
      retryCount++;
      
      if (retryCount < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, retryCount), 8000);
        console.log(`⏳ ${delay}ms 후 재시도...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  return { success: false, error: '최대 재시도 횟수 초과' };
};

const loadFromFirebase = async (date) => {
  try {
    const docRef = doc(db, 'dailyReports', date);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      const data = docSnap.data();
      console.log('Firebase 불러오기 완료:', date, data);
      return data;
    } else {
      console.log('해당 날짜의 데이터가 없습니다:', date);
      return null;
    }
  } catch (error) {
    console.error('Firebase 불러오기 실패:', error);
    return null;
  }
};

const getAllReports = async () => {
  try {
    const querySnapshot = await getDocs(collection(db, 'dailyReports'));
    const reports = [];
    
    querySnapshot.forEach((doc) => {
      reports.push({
        id: doc.id,
        date: doc.id,
        ...doc.data()
      });
    });
    
    console.log('Firebase 전체 데이터 불러오기 완료:', reports);
    return reports.sort((a, b) => new Date(b.date) - new Date(a.date));
  } catch (error) {
    console.error('전체 데이터 불러오기 실패:', error);
    return [];
  }
};

// 데이터 호환성 함수
const migrateDataStructure = (data) => {
  if (!data) return null;
  
  const migratedData = { ...data };
  
  // daOverall 마이그레이션
  if (migratedData.daOverall) {
    if (migratedData.daOverall.image !== undefined && !migratedData.daOverall.images) {
      migratedData.daOverall.images = [
        { src: migratedData.daOverall.image, includeInEmail: migratedData.daOverall.image ? true : false, caption: '' },
        { src: null, includeInEmail: false, caption: '' },
        { src: null, includeInEmail: false, caption: '' },
        { src: null, includeInEmail: false, caption: '' }
      ];
      delete migratedData.daOverall.image;
    }
  }
  
  // mediaDetails 마이그레이션
  if (migratedData.mediaDetails) {
    Object.keys(migratedData.mediaDetails).forEach(media => {
      if (migratedData.mediaDetails[media].image !== undefined && !migratedData.mediaDetails[media].images) {
        migratedData.mediaDetails[media].images = [
          { src: migratedData.mediaDetails[media].image, includeInEmail: migratedData.mediaDetails[media].image ? true : false, caption: '' },
          { src: null, includeInEmail: false, caption: '' },
          { src: null, includeInEmail: false, caption: '' },
          { src: null, includeInEmail: false, caption: '' }
        ];
        delete migratedData.mediaDetails[media].image;
      }
    });
  }
  
  // partnership 마이그레이션
  if (migratedData.partnership) {
    if (migratedData.partnership.image !== undefined && !migratedData.partnership.images) {
      migratedData.partnership.images = [
        { src: migratedData.partnership.image, includeInEmail: migratedData.partnership.image ? true : false, caption: '' },
        { src: null, includeInEmail: false, caption: '' },
        { src: null, includeInEmail: false, caption: '' },
        { src: null, includeInEmail: false, caption: '' }
      ];
      delete migratedData.partnership.image;
    }
  }
  
  return migratedData;
};

const DailyReportPlatform = () => {
  const [currentMedia, setCurrentMedia] = useState('');
  const [reportData, setReportData] = useState({
    date: '',
    senderName: '박희수',
    daOverall: {
      totalBudget: '',
      totalLeads: '',
      totalCPA: '',
      images: [
        { src: null, includeInEmail: false, caption: '' },
        { src: null, includeInEmail: false, caption: '' },
        { src: null, includeInEmail: false, caption: '' },
        { src: null, includeInEmail: false, caption: '' }
      ]
    },
    mediaDetails: {
      '토스': { 
        content: '', 
        images: [
          { src: null, includeInEmail: false, caption: '' },
          { src: null, includeInEmail: false, caption: '' },
          { src: null, includeInEmail: false, caption: '' },
          { src: null, includeInEmail: false, caption: '' }
        ], 
        noUpdate: false 
      },
      '네이버GFA': { 
        content: '', 
        images: [
          { src: null, includeInEmail: false, caption: '' },
          { src: null, includeInEmail: false, caption: '' },
          { src: null, includeInEmail: false, caption: '' },
          { src: null, includeInEmail: false, caption: '' }
        ], 
        noUpdate: false 
      },
      '네이버NOSP': { 
        content: '', 
        images: [
          { src: null, includeInEmail: false, caption: '' },
          { src: null, includeInEmail: false, caption: '' },
          { src: null, includeInEmail: false, caption: '' },
          { src: null, includeInEmail: false, caption: '' }
        ], 
        noUpdate: false 
      },
      '카카오': { 
        content: '', 
        images: [
          { src: null, includeInEmail: false, caption: '' },
          { src: null, includeInEmail: false, caption: '' },
          { src: null, includeInEmail: false, caption: '' },
          { src: null, includeInEmail: false, caption: '' }
        ], 
        noUpdate: false 
      },
      '구글': { 
        content: '', 
        images: [
          { src: null, includeInEmail: false, caption: '' },
          { src: null, includeInEmail: false, caption: '' },
          { src: null, includeInEmail: false, caption: '' },
          { src: null, includeInEmail: false, caption: '' }
        ], 
        noUpdate: false 
      },
      '메타': { 
        content: '', 
        images: [
          { src: null, includeInEmail: false, caption: '' },
          { src: null, includeInEmail: false, caption: '' },
          { src: null, includeInEmail: false, caption: '' },
          { src: null, includeInEmail: false, caption: '' }
        ], 
        noUpdate: false 
      },
      '앱캠페인': { 
        content: '', 
        images: [
          { src: null, includeInEmail: false, caption: '' },
          { src: null, includeInEmail: false, caption: '' },
          { src: null, includeInEmail: false, caption: '' },
          { src: null, includeInEmail: false, caption: '' }
        ], 
        noUpdate: false 
      }
    },
    partnership: {
      totalBudget: '',
      totalLeads: '',
      totalCPA: '',
      details: '',
      images: [
        { src: null, includeInEmail: false, caption: '' },
        { src: null, includeInEmail: false, caption: '' },
        { src: null, includeInEmail: false, caption: '' },
        { src: null, includeInEmail: false, caption: '' }
      ],
      weeklyPlan: ''
    },
    attachmentNote: ''
  });

  const [generatedEmail, setGeneratedEmail] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [allReports, setAllReports] = useState([]);
  const [archiveSuccess, setArchiveSuccess] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [gmailSaveSuccess, setGmailSaveSuccess] = useState(false);
  const [gmailSaveError, setGmailSaveError] = useState('');
  const [isGmailLoading, setIsGmailLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState(false);
  const [showTeamView, setShowTeamView] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [lastUpdatedBy, setLastUpdatedBy] = useState('');
  const [popupImage, setPopupImage] = useState(null);
  const [smartSaveSuccess, setSmartSaveSuccess] = useState(false);
  const [lastSavedSection, setLastSavedSection] = useState('');

  const mediaList = [
    { id: 'DA전체', name: 'DA 전체', icon: '📊', bgColor: '#3B82F6' },
    { id: '토스', name: '토스', icon: '💳', bgColor: '#10B981' },
    { id: '네이버GFA', name: '네이버 GFA', icon: '🔍', bgColor: '#059669' },
    { id: '네이버NOSP', name: '네이버 NOSP', icon: '📱', bgColor: '#0891B2' },
    { id: '카카오', name: '카카오', icon: '💬', bgColor: '#EAB308' },
    { id: '구글', name: '구글', icon: '🌐', bgColor: '#DC2626' },
    { id: '메타', name: '메타', icon: '📘', bgColor: '#7C3AED' },
    { id: '앱캠페인', name: '앱캠페인', icon: '📱', bgColor: '#4F46E5' },
    { id: '제휴', name: '제휴', icon: '🤝', bgColor: '#EA580C' }
  ];

  const styles = {
    container: {
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #EFF6FF 0%, #E0E7FF 100%)',
      padding: '16px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
    },
    mainCard: {
      maxWidth: '1200px',
      margin: '0 auto',
      backgroundColor: 'white',
      borderRadius: '24px',
      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
      padding: '24px'
    },
    statusCard: {
      backgroundColor: 'white',
      borderRadius: '16px',
      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
      padding: '16px',
      marginBottom: '16px'
    },
    title: {
      fontSize: '32px',
      fontWeight: 'bold',
      color: '#1F2937',
      textAlign: 'center',
      marginBottom: '8px'
    },
    subtitle: {
      fontSize: '20px',
      color: '#6B7280',
      textAlign: 'center',
      marginBottom: '24px'
    },
    inputGroup: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      marginBottom: '16px'
    },
    input: {
      padding: '12px 16px',
      border: '1px solid #D1D5DB',
      borderRadius: '8px',
      fontSize: '14px',
      outline: 'none',
      transition: 'all 0.2s'
    },
    button: {
      padding: '12px 24px',
      borderRadius: '8px',
      border: 'none',
      cursor: 'pointer',
      fontWeight: '600',
      fontSize: '14px',
      transition: 'all 0.2s',
      display: 'flex',
      alignItems: 'center',
      gap: '8px'
    },
    mediaGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
      gap: '16px',
      marginBottom: '24px'
    },
    mediaButton: {
      padding: '20px',
      borderRadius: '16px',
      border: '2px solid #E5E7EB',
      backgroundColor: 'white',
      cursor: 'pointer',
      textAlign: 'center',
      position: 'relative',
      transition: 'all 0.2s',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center'
    },
    mediaIcon: {
      fontSize: '32px',
      marginBottom: '12px'
    },
    mediaName: {
      fontSize: '16px',
      fontWeight: '600',
      color: '#1F2937',
      marginBottom: '4px'
    },
    mediaStatus: {
      fontSize: '12px',
      color: '#6B7280'
    },
    statusBadge: {
      position: 'absolute',
      top: '8px',
      right: '8px',
      width: '20px',
      height: '20px',
      borderRadius: '50%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '12px',
      color: 'white',
      fontWeight: 'bold'
    },
    actionGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 1fr)',
      gap: '12px'
    },
    modal: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    },
    modalContent: {
      backgroundColor: 'white',
      borderRadius: '16px',
      padding: '32px',
      maxWidth: '400px',
      margin: '16px',
      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
    }
  };

  const getDefaultDate = () => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    
    if (dayOfWeek === 1) {
      const friday = new Date(today);
      friday.setDate(today.getDate() - 3);
      return friday.toISOString().split('T')[0];
    } else {
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      return yesterday.toISOString().split('T')[0];
    }
  };

  const handleDateChange = async (newDate) => {
    setIsLoading(true);
    
    if (reportData.date) {
      await saveToFirebase(reportData.date, reportData);
    }
    
    const savedData = await loadFromFirebase(newDate);
    const migratedData = migrateDataStructure(savedData);
    
    const defaultData = {
      date: newDate,
      senderName: reportData.senderName,
      daOverall: {
        totalBudget: '',
        totalLeads: '',
        totalCPA: '',
        images: [
          { src: null, includeInEmail: false, caption: '' },
          { src: null, includeInEmail: false, caption: '' },
          { src: null, includeInEmail: false, caption: '' },
          { src: null, includeInEmail: false, caption: '' }
        ]
      },
      mediaDetails: {
        '토스': { 
          content: '', 
          images: [
            { src: null, includeInEmail: false, caption: '' },
            { src: null, includeInEmail: false, caption: '' },
            { src: null, includeInEmail: false, caption: '' },
            { src: null, includeInEmail: false, caption: '' }
          ], 
          noUpdate: false 
        },
        '네이버GFA': { 
          content: '', 
          images: [
            { src: null, includeInEmail: false, caption: '' },
            { src: null, includeInEmail: false, caption: '' },
            { src: null, includeInEmail: false, caption: '' },
            { src: null, includeInEmail: false, caption: '' }
          ], 
          noUpdate: false 
        },
        '네이버NOSP': { 
          content: '', 
          images: [
            { src: null, includeInEmail: false, caption: '' },
            { src: null, includeInEmail: false, caption: '' },
            { src: null, includeInEmail: false, caption: '' },
            { src: null, includeInEmail: false, caption: '' }
          ], 
          noUpdate: false 
        },
        '카카오': { 
          content: '', 
          images: [
            { src: null, includeInEmail: false, caption: '' },
            { src: null, includeInEmail: false, caption: '' },
            { src: null, includeInEmail: false, caption: '' },
            { src: null, includeInEmail: false, caption: '' }
          ], 
          noUpdate: false 
        },
        '구글': { 
          content: '', 
          images: [
            { src: null, includeInEmail: false, caption: '' },
            { src: null, includeInEmail: false, caption: '' },
            { src: null, includeInEmail: false, caption: '' },
            { src: null, includeInEmail: false, caption: '' }
          ], 
          noUpdate: false 
        },
        '메타': { 
          content: '', 
          images: [
            { src: null, includeInEmail: false, caption: '' },
            { src: null, includeInEmail: false, caption: '' },
            { src: null, includeInEmail: false, caption: '' },
            { src: null, includeInEmail: false, caption: '' }
          ], 
          noUpdate: false 
        },
        '앱캠페인': { 
          content: '', 
          images: [
            { src: null, includeInEmail: false, caption: '' },
            { src: null, includeInEmail: false, caption: '' },
            { src: null, includeInEmail: false, caption: '' },
            { src: null, includeInEmail: false, caption: '' }
          ], 
          noUpdate: false 
        }
      },
      partnership: {
        totalBudget: '',
        totalLeads: '',
        totalCPA: '',
        details: '',
        images: [
          { src: null, includeInEmail: false, caption: '' },
          { src: null, includeInEmail: false, caption: '' },
          { src: null, includeInEmail: false, caption: '' },
          { src: null, includeInEmail: false, caption: '' }
        ],
        weeklyPlan: ''
      },
      attachmentNote: ''
    };

    setReportData(migratedData || defaultData);
    setLastUpdatedBy(migratedData?.lastUpdatedBy || '');
    setIsLoading(false);
  };

  useEffect(() => {
    const initializeData = async () => {
      setIsLoading(true);
      const defaultDate = getDefaultDate();
      
      const savedData = await loadFromFirebase(defaultDate);
      const migratedData = migrateDataStructure(savedData);
      
      const defaultData = {
        date: defaultDate,
        senderName: '박희수',
        daOverall: {
          totalBudget: '',
          totalLeads: '',
          totalCPA: '',
          images: [
            { src: null, includeInEmail: false, caption: '' },
            { src: null, includeInEmail: false, caption: '' },
            { src: null, includeInEmail: false, caption: '' },
            { src: null, includeInEmail: false, caption: '' }
          ]
        },
        mediaDetails: {
          '토스': { 
            content: '', 
            images: [
              { src: null, includeInEmail: false, caption: '' },
              { src: null, includeInEmail: false, caption: '' },
              { src: null, includeInEmail: false, caption: '' },
              { src: null, includeInEmail: false, caption: '' }
            ], 
            noUpdate: false 
          },
          '네이버GFA': { 
            content: '', 
            images: [
              { src: null, includeInEmail: false, caption: '' },
              { src: null, includeInEmail: false, caption: '' },
              { src: null, includeInEmail: false, caption: '' },
              { src: null, includeInEmail: false, caption: '' }
            ], 
            noUpdate: false 
          },
          '네이버NOSP': { 
            content: '', 
            images: [
              { src: null, includeInEmail: false, caption: '' },
              { src: null, includeInEmail: false, caption: '' },
              { src: null, includeInEmail: false, caption: '' },
              { src: null, includeInEmail: false, caption: '' }
            ], 
            noUpdate: false 
          },
          '카카오': { 
            content: '', 
            images: [
              { src: null, includeInEmail: false, caption: '' },
              { src: null, includeInEmail: false, caption: '' },
              { src: null, includeInEmail: false, caption: '' },
              { src: null, includeInEmail: false, caption: '' }
            ], 
            noUpdate: false 
          },
          '구글': { 
            content: '', 
            images: [
              { src: null, includeInEmail: false, caption: '' },
              { src: null, includeInEmail: false, caption: '' },
              { src: null, includeInEmail: false, caption: '' },
              { src: null, includeInEmail: false, caption: '' }
            ], 
            noUpdate: false 
          },
          '메타': { 
            content: '', 
            images: [
              { src: null, includeInEmail: false, caption: '' },
              { src: null, includeInEmail: false, caption: '' },
              { src: null, includeInEmail: false, caption: '' },
              { src: null, includeInEmail: false, caption: '' }
            ], 
            noUpdate: false 
          },
          '앱캠페인': { 
            content: '', 
            images: [
              { src: null, includeInEmail: false, caption: '' },
              { src: null, includeInEmail: false, caption: '' },
              { src: null, includeInEmail: false, caption: '' },
              { src: null, includeInEmail: false, caption: '' }
            ], 
            noUpdate: false 
          }
        },
        partnership: {
          totalBudget: '',
          totalLeads: '',
          totalCPA: '',
          details: '',
          images: [
            { src: null, includeInEmail: false, caption: '' },
            { src: null, includeInEmail: false, caption: '' },
            { src: null, includeInEmail: false, caption: '' },
            { src: null, includeInEmail: false, caption: '' }
          ],
          weeklyPlan: ''
        },
        attachmentNote: ''
      };

      setReportData(migratedData || defaultData);
      setLastUpdatedBy(migratedData?.lastUpdatedBy || '');
      
      const reports = await getAllReports();
      setAllReports(reports);
      setIsLoading(false);
    };
    
    initializeData();
  }, []);

  // 🛡️ 진짜 안전한 자동 저장 시스템
  useEffect(() => {
    const autoSaveInterval = setInterval(async () => {
      if (reportData.date && !isLoading && currentMedia) {
        let section;
        if (currentMedia === 'DA전체') {
          section = 'daOverall';
        } else if (currentMedia === '제휴') {
          section = 'partnership';
        } else if (currentMedia !== '미리보기') {
          section = `media_${currentMedia}`;
        }
        
        if (section) {
          console.log(`🛡️ 자동 저장 시작: ${section} (다른 섹션은 보존)`);
          const result = await realSafeSaveToFirebase(reportData.date, reportData, section, reportData.senderName);
          if (result.success) {
            setSyncSuccess(true);
            console.log('✅ 자동 저장 성공 - 다른 팀원 데이터 보존됨');
            setTimeout(() => setSyncSuccess(false), 3000);
          } else {
            console.error('❌ 자동 저장 실패:', result.error);
          }
        }
      }
    }, 25000); // 25초

    return () => clearInterval(autoSaveInterval);
  }, [reportData, isLoading, currentMedia]);

  // ESC 키 처리 useEffect
  useEffect(() => {
    const handleEscKey = (event) => {
      if (event.key === 'Escape' && popupImage) {
        closePopup();
      }
    };

    document.addEventListener('keydown', handleEscKey);
    return () => {
      document.removeEventListener('keydown', handleEscKey);
    };
  }, [popupImage]);

  const handleCheckboxChange = (section, media, index, checked) => {
    if (section === 'daOverall') {
      setReportData(prev => ({
        ...prev,
        daOverall: {
          ...prev.daOverall,
          images: prev.daOverall.images.map((img, i) => 
            i === index ? { ...img, includeInEmail: checked } : img
          )
        }
      }));
    } else if (section === 'mediaDetails') {
      setReportData(prev => ({
        ...prev,
        mediaDetails: {
          ...prev.mediaDetails,
          [media]: {
            ...prev.mediaDetails[media],
            images: prev.mediaDetails[media].images.map((img, i) => 
              i === index ? { ...img, includeInEmail: checked } : img
            )
          }
        }
      }));
    } else if (section === 'partnership') {
      setReportData(prev => ({
        ...prev,
        partnership: {
          ...prev.partnership,
          images: prev.partnership.images.map((img, i) => 
            i === index ? { ...img, includeInEmail: checked } : img
          )
        }
      }));
    }
  };

  const handleCaptionChange = (section, media, index, caption) => {
    // 한글 입력 최적화: 즉시 상태 업데이트
    if (section === 'daOverall') {
      setReportData(prev => ({
        ...prev,
        daOverall: {
          ...prev.daOverall,
          images: prev.daOverall.images.map((img, i) => 
            i === index ? { ...img, caption } : img
          )
        }
      }));
    } else if (section === 'mediaDetails') {
      setReportData(prev => ({
        ...prev,
        mediaDetails: {
          ...prev.mediaDetails,
          [media]: {
            ...prev.mediaDetails[media],
            images: prev.mediaDetails[media].images.map((img, i) => 
              i === index ? { ...img, caption } : img
            )
          }
        }
      }));
    } else if (section === 'partnership') {
      setReportData(prev => ({
        ...prev,
        partnership: {
          ...prev.partnership,
          images: prev.partnership.images.map((img, i) => 
            i === index ? { ...img, caption } : img
          )
        }
      }));
    }
  };

  const handleImageDelete = (section, media, index) => {
    if (section === 'daOverall') {
      setReportData(prev => ({
        ...prev,
        daOverall: {
          ...prev.daOverall,
          images: prev.daOverall.images.map((img, i) => 
            i === index ? { src: null, includeInEmail: false, caption: '' } : img
          )
        }
      }));
    } else if (section === 'mediaDetails') {
      setReportData(prev => ({
        ...prev,
        mediaDetails: {
          ...prev.mediaDetails,
          [media]: {
            ...prev.mediaDetails[media],
            images: prev.mediaDetails[media].images.map((img, i) => 
              i === index ? { src: null, includeInEmail: false, caption: '' } : img
            )
          }
        }
      }));
    } else if (section === 'partnership') {
      setReportData(prev => ({
        ...prev,
        partnership: {
          ...prev.partnership,
          images: prev.partnership.images.map((img, i) => 
            i === index ? { src: null, includeInEmail: false, caption: '' } : img
          )
        }
      }));
    }
  };

  const handleImageClick = (imageSrc) => {
    setPopupImage(imageSrc);
  };

  const closePopup = () => {
    setPopupImage(null);
  };

  const handleImagePaste = (e, section, media = null, imageIndex = 0) => {
    e.preventDefault();
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const blob = items[i].getAsFile();
        const reader = new FileReader();
        reader.onload = (event) => {
          const imageData = event.target.result;
          if (section === 'daOverall') {
            setReportData(prev => ({
              ...prev,
              daOverall: { 
                ...prev.daOverall, 
                images: prev.daOverall.images.map((img, idx) => 
                  idx === imageIndex ? { src: imageData, includeInEmail: true, caption: img.caption || '' } : img
                )
              }
            }));
          } else if (section === 'mediaDetails') {
            setReportData(prev => ({
              ...prev,
              mediaDetails: {
                ...prev.mediaDetails,
                [media]: { 
                  ...prev.mediaDetails[media], 
                  images: prev.mediaDetails[media].images.map((img, idx) => 
                    idx === imageIndex ? { src: imageData, includeInEmail: true, caption: img.caption || '' } : img
                  )
                }
              }
            }));
          } else if (section === 'partnership') {
            setReportData(prev => ({
              ...prev,
              partnership: { 
                ...prev.partnership, 
                images: prev.partnership.images.map((img, idx) => 
                  idx === imageIndex ? { src: imageData, includeInEmail: true, caption: img.caption || '' } : img
                )
              }
            }));
          }
        };
        reader.readAsDataURL(blob);
        break;
      }
    }
  };

  const ImageUploadSlot = ({ image, onDelete, onCheckboxChange, onCaptionChange, onPaste, section, media, index, isLarge = false, disabled = false }) => {
    const safeImage = image || { src: null, includeInEmail: false, caption: '' };
    
    return (
      <div style={{
        border: '2px dashed #D1D5DB',
        borderRadius: '8px',
        padding: '12px',
        textAlign: 'center',
        backgroundColor: disabled ? '#F3F4F6' : '#F9FAFB',
        position: 'relative',
        minHeight: isLarge ? '260px' : '180px',
        opacity: disabled ? 0.5 : 1
      }}>
        {safeImage.src ? (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ position: 'relative', flex: '1' }}>
              <img 
                src={safeImage.src} 
                alt={`${media || section} ${index + 1}`}
                style={{ 
                  width: '100%', 
                  height: isLarge ? '120px' : '80px', 
                  objectFit: 'cover', 
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
                onClick={() => handleImageClick(safeImage.src)}
                title="클릭하면 확대해서 볼 수 있습니다"
              />
              <button
                onClick={() => onDelete(section, media, index)}
                style={{
                  position: 'absolute',
                  top: '4px',
                  right: '4px',
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  backgroundColor: '#EF4444',
                  color: 'white',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 'bold',
                  zIndex: 10
                }}
                title="이미지 삭제"
              >
                ×
              </button>
            </div>
            
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              fontSize: '12px',
              padding: '4px 0'
            }}>
              <input 
                type="checkbox" 
                checked={safeImage.includeInEmail}
                onChange={(e) => onCheckboxChange(section, media, index, e.target.checked)}
                style={{ marginRight: '6px', width: '14px', height: '14px' }}
              />
              <span style={{ color: '#374151', fontWeight: '500' }}>메일 포함</span>
            </div>
            
            <div style={{ marginTop: '4px' }}>
              <label style={{ 
                display: 'block', 
                fontSize: '11px', 
                color: '#6B7280', 
                marginBottom: '4px',
                textAlign: 'left'
              }}>
                이미지 캡션:
              </label>
              <input
                type="text"
                value={safeImage.caption || ''}
                onChange={(e) => onCaptionChange(section, media, index, e.target.value)}
                placeholder="캡션을 입력하세요 (선택사항)"
                style={{
                  width: '100%',
                  padding: '8px',
                  fontSize: '12px',
                  border: '2px solid #D1D5DB',
                  borderRadius: '6px',
                  backgroundColor: 'white',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
                onFocus={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                onCompositionStart={(e) => e.stopPropagation()}
                onCompositionEnd={(e) => e.stopPropagation()}
                autoComplete="off"
              />
            </div>
          </div>
        ) : (
          <div 
            style={{ 
              height: '100%', 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              justifyContent: 'center',
              cursor: disabled ? 'not-allowed' : 'pointer'
            }}
            onPaste={disabled ? null : (e) => onPaste(e, section, media, index)}
            tabIndex={disabled ? -1 : 0}
            onMouseOver={(e) => {
              if (!disabled) {
                e.currentTarget.style.borderColor = '#3B82F6';
              }
            }}
            onMouseOut={(e) => {
              if (!disabled) {
                e.currentTarget.style.borderColor = '#D1D5DB';
              }
            }}
          >
            <div style={{ fontSize: isLarge ? '40px' : '30px', marginBottom: '12px', opacity: 0.5 }}>🖼️</div>
            <p style={{ fontSize: '14px', color: '#6B7280', margin: '4px 0', fontWeight: '500' }}>이미지 {index + 1}</p>
            <p style={{ fontSize: '12px', color: '#9CA3AF', margin: 0 }}>
              {disabled ? '특이사항 없음' : 'Ctrl+V로 붙여넣기'}
            </p>
          </div>
        )}
      </div>
    );
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const weekDay = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()];
    return `${month}/${day}(${weekDay})`;
  };

  const formatEmailDate = (dateString) => {
    const date = new Date(dateString);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${month}${day}`;
  };

  const generateEmailContent = () => {
    const formattedDate = formatDate(reportData.date);
    const senderName = reportData.senderName || '박희수';
    
    let emailContent = `안녕하세요,\n에코마케팅 ${senderName}입니다.\n\n`;
    
    if (reportData.attachmentNote.trim()) {
      emailContent += `${reportData.attachmentNote}\n\n`;
    } else {
      emailContent += `리포트는 용량크기 상 대용량 첨부로 공유드립니다.\n(대용량 첨부파일)\n\n`;
    }
    
    emailContent += `* DA 파트\n[전체]\n`;
    if (reportData.daOverall.totalBudget || reportData.daOverall.totalLeads || reportData.daOverall.totalCPA) {
      emailContent += `${formattedDate} 총 광고비 ${reportData.daOverall.totalBudget} / 가망자원 ${reportData.daOverall.totalLeads} / 가망CPA ${reportData.daOverall.totalCPA}\n\n`;
    }
    
    const mediaOrder = ['토스', '네이버GFA', '네이버NOSP', '카카오', '구글', '메타', '앱캠페인'];
    const hasMediaContent = mediaOrder.some(media => reportData.mediaDetails[media]?.content?.trim());
    if (hasMediaContent) {
      emailContent += `[미디어 상세]\n`;
      let mediaCount = 0;
      mediaOrder.forEach(media => {
        const data = reportData.mediaDetails[media];
        if (data?.content?.trim()) {
          mediaCount++;
          emailContent += `${mediaCount}. ${media}\n${data.content}\n\n`;
        }
      });
    }
    
    if (reportData.partnership.totalBudget || reportData.partnership.totalLeads || reportData.partnership.totalCPA || reportData.partnership.details?.trim()) {
      emailContent += `* 제휴 파트\n`;
      
      if (reportData.partnership.totalBudget || reportData.partnership.totalLeads || reportData.partnership.totalCPA) {
        emailContent += `${formattedDate} 광고비 ${reportData.partnership.totalBudget} / 가망자원 ${reportData.partnership.totalLeads} / 가망 CPA ${reportData.partnership.totalCPA}\n\n`;
      }
      
      if (reportData.partnership.details?.trim()) {
        emailContent += `${reportData.partnership.details}\n\n`;
      }
    }
    
    if (reportData.partnership.weeklyPlan?.trim()) {
      emailContent += `[금주 MKT 플랜]\n${reportData.partnership.weeklyPlan}\n\n`;
    }
    
    emailContent += `감사합니다.\n${senderName} 드림`;
    
    return emailContent;
  };

  const generateEmailWithImages = () => {
    const formattedDate = formatDate(reportData.date);
    const senderName = reportData.senderName || '박희수';
    
    const emailSections = [];
    
    emailSections.push({
      type: 'text',
      content: `안녕하세요,\n에코마케팅 ${senderName}입니다.\n\n`
    });
    
    if (reportData.attachmentNote.trim()) {
      emailSections.push({
        type: 'text',
        content: `${reportData.attachmentNote}\n\n`
      });
    } else {
      emailSections.push({
        type: 'text',
        content: `리포트는 용량크기 상 대용량 첨부로 공유드립니다.\n(대용량 첨부파일)\n\n`
      });
    }
    
    emailSections.push({
      type: 'text',
      content: `* DA 파트\n[전체]\n`
    });
    
    if (reportData.daOverall.totalBudget || reportData.daOverall.totalLeads || reportData.daOverall.totalCPA) {
      emailSections.push({
        type: 'text',
        content: `${formattedDate} 총 광고비 ${reportData.daOverall.totalBudget} / 가망자원 ${reportData.daOverall.totalLeads} / 가망CPA ${reportData.daOverall.totalCPA}\n\n`
      });
    }
    
    if (reportData.daOverall.images && Array.isArray(reportData.daOverall.images)) {
      reportData.daOverall.images.forEach((image, index) => {
        if (image && image.src && image.includeInEmail) {
          if (image.caption && image.caption.trim()) {
            emailSections.push({
              type: 'text',
              content: `▼ ${image.caption}\n`
            });
          }
          emailSections.push({
            type: 'image',
            src: image.src,
            alt: `DA 전체 성과 ${index + 1}`
          });
        }
      });
    }
    
    const mediaOrder = ['토스', '네이버GFA', '네이버NOSP', '카카오', '구글', '메타', '앱캠페인'];
    const hasMediaContent = mediaOrder.some(media => reportData.mediaDetails[media]?.content?.trim());
    
    if (hasMediaContent) {
      emailSections.push({
        type: 'text',
        content: `[미디어 상세]\n`
      });
      
      let mediaCount = 0;
      mediaOrder.forEach(media => {
        const data = reportData.mediaDetails[media];
        if (data?.content?.trim()) {
          mediaCount++;
          emailSections.push({
            type: 'text',
            content: `${mediaCount}. ${media}\n${data.content}\n\n`
          });
          
          if (data.images && Array.isArray(data.images)) {
            data.images.forEach((image, index) => {
              if (image && image.src && image.includeInEmail) {
                if (image.caption && image.caption.trim()) {
                  emailSections.push({
                    type: 'text',
                    content: `▼ ${image.caption}\n`
                  });
                }
                emailSections.push({
                  type: 'image',
                  src: image.src,
                  alt: `${media} 성과 ${index + 1}`
                });
              }
            });
          }
        }
      });
    }
    
    if (reportData.partnership.totalBudget || reportData.partnership.totalLeads || reportData.partnership.totalCPA || reportData.partnership.details?.trim()) {
      emailSections.push({
        type: 'text',
        content: `* 제휴 파트\n`
      });
      
      if (reportData.partnership.totalBudget || reportData.partnership.totalLeads || reportData.partnership.totalCPA) {
        emailSections.push({
          type: 'text',
          content: `${formattedDate} 광고비 ${reportData.partnership.totalBudget} / 가망자원 ${reportData.partnership.totalLeads} / 가망 CPA ${reportData.partnership.totalCPA}\n\n`
        });
      }
      
      if (reportData.partnership.details?.trim()) {
        emailSections.push({
          type: 'text',
          content: `${reportData.partnership.details}\n\n`
        });
      }
      
      if (reportData.partnership.images && Array.isArray(reportData.partnership.images)) {
        reportData.partnership.images.forEach((image, index) => {
          if (image && image.src && image.includeInEmail) {
            if (image.caption && image.caption.trim()) {
              emailSections.push({
                type: 'text',
                content: `▼ ${image.caption}\n`
              });
            }
            emailSections.push({
              type: 'image',
              src: image.src,
              alt: `제휴 성과 ${index + 1}`
            });
          }
        });
      }
    }
    
    if (reportData.partnership.weeklyPlan?.trim()) {
      emailSections.push({
        type: 'text',
        content: `[금주 MKT 플랜]\n${reportData.partnership.weeklyPlan}\n\n`
      });
    }
    
    emailSections.push({
      type: 'text',
      content: `감사합니다.\n${senderName} 드림`
    });
    
    return emailSections;
  };

  useEffect(() => {
    const emailContent = generateEmailContent();
    setGeneratedEmail(emailContent);
  }, [reportData]);

  const copyEmailToClipboard = async () => {
    try {
      const emailDate = formatEmailDate(reportData.date);
      const subject = `[에코/장기TM/DA] 메리츠화재 데일리보고_25년 ${emailDate}`;
      const recipients = '받는사람: 박영빈님/TM마케팅파트 <yb.park@meritz.co.kr>';
      const cc = '참조: 김윤희님/TM마케팅파트 <yoonhee.k@meritz.co.kr>, 이원진/리더/TM마케팅파트 <wonjin.lee@meritz.co.kr>, echo_메리츠다이렉트 <echo_meritzdirect@echomarketing.co.kr>, 디트라이브_팀메일 <meritz@dtribe.co.kr>';
      
      const fullEmail = `${subject}\n\n${recipients}\n${cc}\n\n${generatedEmail}`;
      
      await navigator.clipboard.writeText(fullEmail);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('복사 실패:', err);
      alert('메일 내용 복사에 실패했습니다.');
    }
  };

  const saveToGmailDrafts = () => {
    try {
      setIsGmailLoading(true);
      setGmailSaveError('');
      setGmailSaveSuccess(false);
      
      const emailDate = formatEmailDate(reportData.date);
      const subject = `[에코/장기TM/DA] 메리츠화재 데일리보고_25년 ${emailDate}`;
      const toEmail = 'yb.park@meritz.co.kr';
      const ccEmails = 'yoonhee.k@meritz.co.kr,wonjin.lee@meritz.co.kr,echo_meritzdirect@echomarketing.co.kr,meritz@dtribe.co.kr';
      
      const gmailUrl = `https://mail.google.com/mail/u/0/?fs=1&tf=cm` +
        `&su=${encodeURIComponent(subject)}` +
        `&to=${encodeURIComponent(toEmail)}` +
        `&cc=${encodeURIComponent(ccEmails)}` +
        `&body=${encodeURIComponent(generatedEmail)}`;
      
      window.open(gmailUrl, '_blank');
      
      setGmailSaveSuccess(true);
      setTimeout(() => setGmailSaveSuccess(false), 3000);
      
    } catch (error) {
      console.error('Gmail 저장 실패:', error);
      setGmailSaveError(`Gmail 저장 실패: ${error.message}`);
      setTimeout(() => setGmailSaveError(''), 5000);
    } finally {
      setIsGmailLoading(false);
    }
  };

  // 🛡️ 진짜 안전한 수동 저장 함수
  const saveCurrentData = async () => {
    let section;
    if (currentMedia === 'DA전체') {
      section = 'daOverall';
    } else if (currentMedia === '제휴') {
      section = 'partnership';
    } else if (currentMedia && currentMedia !== '미리보기') {
      section = `media_${currentMedia}`;
    } else {
      // 메인 화면에서의 전체 저장
      try {
        setIsLoading(true);
        const result = await saveToFirebase(reportData.date, reportData);
        if (result) {
          setSaveSuccess(true);
          setTimeout(() => setSaveSuccess(false), 3000);
          const reports = await getAllReports();
          setAllReports(reports);
        } else {
          alert('저장에 실패했습니다. 다시 시도해주세요.');
        }
      } catch (error) {
        console.error('전체 저장 실패:', error);
        alert('저장 중 오류가 발생했습니다.');
      } finally {
        setIsLoading(false);
      }
      return;
    }
    
    try {
      setIsLoading(true);
      console.log(`🛡️ 수동 저장 시작: ${section} (다른 섹션은 보존)`);
      
      const result = await realSafeSaveToFirebase(reportData.date, reportData, section, reportData.senderName);
      if (result.success) {
        setSmartSaveSuccess(true);
        setLastSavedSection(section);
        setTimeout(() => {
          setSmartSaveSuccess(false);
          setLastSavedSection('');
        }, 3000);
        
        console.log('✅ 수동 저장 성공 - 다른 팀원 데이터 보존됨');
      } else {
        console.error('❌ 수동 저장 실패:', result.error);
        alert('저장에 실패했습니다. 다시 시도해주세요.');
      }
    } catch (error) {
      console.error('저장 중 오류:', error);
      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const archiveData = async () => {
    const success = await saveToFirebase(reportData.date, reportData);
    if (success) {
      setArchiveSuccess(true);
      setTimeout(() => setArchiveSuccess(false), 2000);
      const reports = await getAllReports();
      setAllReports(reports);
    }
  };

  const resetCurrentData = () => {
    setShowResetConfirm(true);
  };

  const confirmReset = async () => {
    const emptyData = {
      date: reportData.date,
      senderName: reportData.senderName,
      daOverall: {
        totalBudget: '',
        totalLeads: '',
        totalCPA: '',
        images: [
          { src: null, includeInEmail: false, caption: '' },
          { src: null, includeInEmail: false, caption: '' },
          { src: null, includeInEmail: false, caption: '' },
          { src: null, includeInEmail: false, caption: '' }
        ]
      },
      mediaDetails: {
        '토스': { 
          content: '', 
          images: [
            { src: null, includeInEmail: false, caption: '' },
            { src: null, includeInEmail: false, caption: '' },
            { src: null, includeInEmail: false, caption: '' },
            { src: null, includeInEmail: false, caption: '' }
          ], 
          noUpdate: false 
        },
        '네이버GFA': { 
          content: '', 
          images: [
            { src: null, includeInEmail: false, caption: '' },
            { src: null, includeInEmail: false, caption: '' },
            { src: null, includeInEmail: false, caption: '' },
            { src: null, includeInEmail: false, caption: '' }
          ], 
          noUpdate: false 
        },
        '네이버NOSP': { 
          content: '', 
          images: [
            { src: null, includeInEmail: false, caption: '' },
            { src: null, includeInEmail: false, caption: '' },
            { src: null, includeInEmail: false, caption: '' },
            { src: null, includeInEmail: false, caption: '' }
          ], 
          noUpdate: false 
        },
        '카카오': { 
          content: '', 
          images: [
            { src: null, includeInEmail: false, caption: '' },
            { src: null, includeInEmail: false, caption: '' },
            { src: null, includeInEmail: false, caption: '' },
            { src: null, includeInEmail: false, caption: '' }
          ], 
          noUpdate: false 
        },
        '구글': { 
          content: '', 
          images: [
            { src: null, includeInEmail: false, caption: '' },
            { src: null, includeInEmail: false, caption: '' },
            { src: null, includeInEmail: false, caption: '' },
            { src: null, includeInEmail: false, caption: '' }
          ], 
          noUpdate: false 
        },
        '메타': { 
          content: '', 
          images: [
            { src: null, includeInEmail: false, caption: '' },
            { src: null, includeInEmail: false, caption: '' },
            { src: null, includeInEmail: false, caption: '' },
            { src: null, includeInEmail: false, caption: '' }
          ], 
          noUpdate: false 
        },
        '앱캠페인': { 
          content: '', 
          images: [
            { src: null, includeInEmail: false, caption: '' },
            { src: null, includeInEmail: false, caption: '' },
            { src: null, includeInEmail: false, caption: '' },
            { src: null, includeInEmail: false, caption: '' }
          ], 
          noUpdate: false 
        }
      },
      partnership: {
        totalBudget: '',
        totalLeads: '',
        totalCPA: '',
        details: '',
        images: [
          { src: null, includeInEmail: false, caption: '' },
          { src: null, includeInEmail: false, caption: '' },
          { src: null, includeInEmail: false, caption: '' },
          { src: null, includeInEmail: false, caption: '' }
        ],
        weeklyPlan: ''
      },
      attachmentNote: ''
    };
    
    setReportData(emptyData);
    await saveToFirebase(reportData.date, emptyData);
    setShowResetConfirm(false);
    setResetSuccess(true);
    setTimeout(() => setResetSuccess(false), 2000);
  };

  const cancelReset = () => {
    setShowResetConfirm(false);
  };

  const loadArchivedData = async (date) => {
    try {
      setIsLoading(true);
      const data = await loadFromFirebase(date);
      const migratedData = migrateDataStructure(data);
      
      if (migratedData) {
        setReportData({ ...migratedData, date });
        setLastUpdatedBy(migratedData.lastUpdatedBy || '');
        setShowArchive(false);
        setShowTeamView(false);
      }
      setIsLoading(false);
    } catch (error) {
      console.error('아카이브 데이터 불러오기 실패:', error);
      setIsLoading(false);
    }
  };

  const getCompletionStatus = () => {
    const status = {};
    
    status['DA전체'] = !!(reportData.daOverall.totalBudget || reportData.daOverall.totalLeads || reportData.daOverall.totalCPA);
    
    Object.keys(reportData.mediaDetails).forEach(media => {
      const mediaData = reportData.mediaDetails[media];
      if (mediaData && mediaData.noUpdate) {
        status[media] = 'noUpdate';
      } else if (mediaData && mediaData.content?.trim()) {
        status[media] = 'completed';
      } else {
        status[media] = 'incomplete';
      }
    });
    
    status['제휴'] = !!(reportData.partnership.totalBudget || reportData.partnership.totalLeads || reportData.partnership.totalCPA || reportData.partnership.details?.trim());
    
    return status;
  };

  if (showArchive) {
    return (
      <div style={styles.container}>
        <div style={styles.mainCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <button
                onClick={() => setShowArchive(false)}
                style={{
                  ...styles.button,
                  backgroundColor: '#F3F4F6',
                  color: '#374151',
                  padding: '8px 12px',
                  marginRight: '16px'
                }}
              >
                ←
              </button>
              <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#1F2937', margin: 0 }}>과거 리포트</h1>
            </div>
          </div>
          
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <div style={{ 
                width: '32px', 
                height: '32px', 
                border: '3px solid #3B82F6', 
                borderTop: '3px solid transparent', 
                borderRadius: '50%', 
                animation: 'spin 1s linear infinite',
                margin: '0 auto 16px'
              }}></div>
              <p style={{ color: '#6B7280', fontSize: '16px' }}>데이터를 불러오는 중...</p>
            </div>
          ) : allReports.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <div style={{ fontSize: '64px', marginBottom: '16px' }}>📁</div>
              <p style={{ color: '#6B7280', fontSize: '16px' }}>저장된 리포트가 없습니다.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
              {allReports.map(report => (
                <button
                  key={report.id}
                  onClick={() => loadArchivedData(report.date)}
                  style={{
                    padding: '16px',
                    backgroundColor: '#EFF6FF',
                    border: '2px solid #BFDBFE',
                    borderRadius: '12px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => {
                    e.target.style.backgroundColor = '#DBEAFE';
                    e.target.style.borderColor = '#93C5FD';
                  }}
                  onMouseOut={(e) => {
                    e.target.style.backgroundColor = '#EFF6FF';
                    e.target.style.borderColor = '#BFDBFE';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontWeight: '600', color: '#1E40AF', fontSize: '16px' }}>
                        {formatDate(report.date)}
                      </div>
                      <div style={{ fontSize: '14px', color: '#3B82F6' }}>
                        {report.senderName}
                      </div>
                      <div style={{ fontSize: '12px', color: '#6B7280' }}>
                        {report.lastUpdatedBy && `최종 수정: ${report.lastUpdatedBy}`}
                      </div>
                    </div>
                    <div style={{ fontSize: '24px' }}>📅</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!currentMedia) {
    const completionStatus = getCompletionStatus();
    const completedCount = Object.values(completionStatus).filter(status => status === 'completed' || status === 'noUpdate' || status === true).length;
    
    return (
      <div style={styles.container}>
        <div style={styles.mainCard}>
          <div style={styles.statusCard}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{ 
                  width: '12px', 
                  height: '12px', 
                  borderRadius: '50%', 
                  backgroundColor: '#10B981',
                  marginRight: '8px'
                }}></div>
                <span style={{ fontSize: '14px', fontWeight: '500', color: '#374151' }}>
                  🛡️ 진짜 안전한 섹션별 병합
                </span>
                <span style={{ fontSize: '12px', color: '#6B7280', marginLeft: '8px' }}>
                  (A가 토스 쓰고, B가 구글 써도 서로 안 날아감!)
                </span>
                {syncSuccess && (
                  <span style={{ fontSize: '12px', color: '#10B981', marginLeft: '8px' }}>✅ 팀원 데이터 보존됨</span>
                )}
                {smartSaveSuccess && (
                  <span style={{ fontSize: '12px', color: '#10B981', marginLeft: '8px' }}>✅ 안전 저장 완료</span>
                )}
                {lastUpdatedBy && (
                  <span style={{ fontSize: '12px', color: '#6B7280', marginLeft: '8px' }}>
                    마지막 수정: {lastUpdatedBy}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
              <span style={{ fontSize: '48px', marginRight: '16px' }}>👥</span>
              <h1 style={styles.title}>메리츠화재 캠페인</h1>
            </div>
            <h2 style={styles.subtitle}>데일리 리포트 플랫폼</h2>
            
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '32px', marginBottom: '24px', flexWrap: 'wrap' }}>
              <div style={styles.inputGroup}>
                <label style={{ fontSize: '14px', fontWeight: '500', color: '#374151' }}>리포트 날짜:</label>
                <input
                  type="date"
                  value={reportData.date}
                  onChange={(e) => handleDateChange(e.target.value)}
                  style={styles.input}
                  disabled={isLoading}
                />
                <span style={{ fontSize: '14px', color: '#6B7280' }}>({formatDate(reportData.date)})</span>
              </div>
              
              <div style={styles.inputGroup}>
                <label style={{ fontSize: '14px', fontWeight: '500', color: '#374151' }}>보내는 사람:</label>
                <input
                  type="text"
                  value={reportData.senderName || ''}
                  onChange={(e) => setReportData(prev => ({ ...prev, senderName: e.target.value }))}
                  style={{ ...styles.input, width: '100px' }}
                  placeholder="박희수"
                  disabled={isLoading}
                />
                <span style={{ fontSize: '14px', color: '#6B7280' }}>님</span>
              </div>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
              <div style={{ fontSize: '14px', color: '#6B7280' }}>
                작성 완료: {completedCount}/9
              </div>
              {isLoading && (
                <div style={{ display: 'flex', alignItems: 'center', fontSize: '14px', color: '#3B82F6' }}>
                  <div style={{ 
                    width: '16px', 
                    height: '16px', 
                    border: '2px solid #3B82F6', 
                    borderTop: '2px solid transparent', 
                    borderRadius: '50%', 
                    animation: 'spin 1s linear infinite',
                    marginRight: '8px'
                  }}></div>
                  불러오는 중...
                </div>
              )}
            </div>
          </div>
          
          <div style={styles.mediaGrid}>
            {mediaList.map(media => {
              const status = completionStatus[media.id];
              let buttonStyle = { ...styles.mediaButton };
              let statusText = '미작성';
              let statusBadge = null;
              
              if (status === 'completed' || status === true) {
                buttonStyle = { 
                  ...styles.mediaButton, 
                  borderColor: '#10B981', 
                  backgroundColor: '#F0FDF4'
                };
                statusText = '작성 완료';
                statusBadge = (
                  <div style={{ ...styles.statusBadge, backgroundColor: '#10B981' }}>
                    ✓
                  </div>
                );
              } else if (status === 'noUpdate') {
                buttonStyle = { 
                  ...styles.mediaButton, 
                  borderColor: '#F59E0B', 
                  backgroundColor: '#FFFBEB'
                };
                statusText = '특이사항 없음';
                statusBadge = (
                  <div style={{ ...styles.statusBadge, backgroundColor: '#F59E0B' }}>
                    -
                  </div>
                );
              }
              
              return (
                <button
                  key={media.id}
                  onClick={() => setCurrentMedia(media.id)}
                  style={buttonStyle}
                  disabled={isLoading}
                  onMouseOver={(e) => {
                    if (!isLoading) {
                      e.target.style.transform = 'translateY(-2px)';
                      e.target.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.1)';
                    }
                  }}
                  onMouseOut={(e) => {
                    e.target.style.transform = 'translateY(0)';
                    e.target.style.boxShadow = 'none';
                  }}
                >
                  <div style={styles.mediaIcon}>
                    {media.icon}
                  </div>
                  <div style={styles.mediaName}>{media.name}</div>
                  <div style={styles.mediaStatus}>{statusText}</div>
                  {statusBadge}
                </button>
              );
            })}
          </div>

          <div style={styles.actionGrid}>
            <button
              onClick={() => setCurrentMedia('미리보기')}
              style={{ 
                ...styles.button, 
                backgroundColor: '#3B82F6', 
                color: 'white',
                justifyContent: 'center'
              }}
              disabled={isLoading}
            >
              <span>👁️</span>
              전체 미리보기
            </button>
            <button
              onClick={saveCurrentData}
              style={{ 
                ...styles.button, 
                backgroundColor: saveSuccess ? '#10B981' : '#22C55E', 
                color: 'white',
                justifyContent: 'center'
              }}
              disabled={isLoading}
            >
              <span>💾</span>
              {saveSuccess ? '저장 완료!' : '전체 저장하기'}
            </button>
            <button
              onClick={() => setShowArchive(true)}
              style={{ 
                ...styles.button, 
                backgroundColor: '#6B7280', 
                color: 'white',
                justifyContent: 'center'
              }}
              disabled={isLoading}
            >
              <span>📅</span>
              과거 리포트
            </button>
            <button
              onClick={() => setShowResetConfirm(true)}
              style={{ 
                ...styles.button, 
                backgroundColor: resetSuccess ? '#10B981' : '#EF4444', 
                color: 'white',
                justifyContent: 'center'
              }}
              disabled={isLoading}
            >
              <span>🔄</span>
              {resetSuccess ? '초기화 완료!' : '전체 초기화'}
            </button>
          </div>
          
          {showResetConfirm && (
            <div style={styles.modal}>
              <div style={styles.modalContent}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '64px', marginBottom: '16px' }}>🔄</div>
                  <h3 style={{ fontSize: '20px', fontWeight: '600', color: '#1F2937', marginBottom: '8px' }}>데이터 초기화</h3>
                  <p style={{ color: '#6B7280', marginBottom: '24px', lineHeight: '1.5' }}>
                    {formatDate(reportData.date)} 모든 정보를 초기화할까요?
                    <br />
                    <span style={{ color: '#EF4444', fontWeight: '500' }}>이 작업은 되돌릴 수 없으며, 모든 팀원에게 영향을 줍니다.</span>
                  </p>
                  <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
                    <button
                      onClick={cancelReset}
                      style={{
                        ...styles.button,
                        backgroundColor: '#D1D5DB',
                        color: '#374151'
                      }}
                    >
                      취소
                    </button>
                    <button
                      onClick={confirmReset}
                      style={{
                        ...styles.button,
                        backgroundColor: '#EF4444',
                        color: 'white'
                      }}
                    >
                      확인
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (currentMedia === '미리보기') {
    const emailSections = generateEmailWithImages();

    return (
      <div style={styles.container}>
        <div style={styles.mainCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <button
                onClick={() => setCurrentMedia('')}
                style={{
                  ...styles.button,
                  backgroundColor: '#F3F4F6',
                  color: '#374151',
                  padding: '8px 12px',
                  marginRight: '16px'
                }}
              >
                ←
              </button>
              <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#1F2937', margin: 0 }}>메일 미리보기</h1>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={saveToGmailDrafts}
                disabled={isGmailLoading}
                style={{
                  ...styles.button,
                  backgroundColor: gmailSaveSuccess ? '#10B981' : isGmailLoading ? '#9CA3AF' : '#DC2626',
                  color: 'white',
                  cursor: isGmailLoading ? 'not-allowed' : 'pointer'
                }}
              >
                {isGmailLoading ? (
                  <>
                    <div style={{ 
                      width: '16px', 
                      height: '16px', 
                      border: '2px solid white', 
                      borderTop: '2px solid transparent', 
                      borderRadius: '50%', 
                      animation: 'spin 1s linear infinite'
                    }}></div>
                    처리중...
                  </>
                ) : gmailSaveSuccess ? (
                  <>
                    <span>✅</span>
                    Gmail 열림!
                  </>
                ) : (
                  <>
                    <span>📧</span>
                    Gmail 임시보관함
                  </>
                )}
              </button>
              <button
                onClick={copyEmailToClipboard}
                style={{
                  ...styles.button,
                  backgroundColor: copySuccess ? '#10B981' : '#3B82F6',
                  color: 'white'
                }}
              >
                <span>{copySuccess ? '✅' : '📋'}</span>
                {copySuccess ? '복사됨!' : '복사'}
              </button>
            </div>
          </div>
          
          <div style={{ backgroundColor: '#F9FAFB', padding: '24px', borderRadius: '12px', border: '1px solid #E5E7EB' }}>
            <div style={{ marginBottom: '16px', padding: '16px', backgroundColor: '#DBEAFE', borderRadius: '8px' }}>
              <p style={{ fontSize: '14px', color: '#1E40AF', margin: '4px 0' }}>
                <strong>받는사람:</strong> 박영빈님/TM마케팅파트 &lt;yb.park@meritz.co.kr&gt;
              </p>
              <p style={{ fontSize: '14px', color: '#1E40AF', margin: '4px 0' }}>
                <strong>참조:</strong> 김윤희님/TM마케팅파트, 이원진/리더/TM마케팅파트, echo_메리츠다이렉트, 디트라이브_팀메일
              </p>
              <p style={{ fontSize: '14px', color: '#1E40AF', margin: '4px 0' }}>
                <strong>제목:</strong> [에코/장기TM/DA] 메리츠화재 데일리보고_25년 {formatEmailDate(reportData.date)}
              </p>
            </div>
            
            <div style={{ 
              backgroundColor: 'white',
              padding: '20px',
              borderRadius: '8px',
              border: '1px solid #E5E7EB'
            }}>
              {emailSections.map((section, index) => (
                <div key={index}>
                  {section.type === 'text' ? (
                    <div style={{ 
                      whiteSpace: 'pre-wrap',
                      fontSize: '14px',
                      color: '#1F2937',
                      fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                      lineHeight: '1.5',
                      marginBottom: '8px',
                      fontWeight: (
                        section.content.includes('* DA 파트') ||
                        section.content.includes('[전체]') ||
                        section.content.includes('[미디어 상세]') ||
                        section.content.includes('[금주 MKT 플랜]') ||
                        /^\d+\.\s[가-힣]+\n/.test(section.content)
                      ) ? 'bold' : 'normal'
                    }}>
                      {/^\d+\.\s[가-힣]+\n/.test(section.content) ? (
                        <span>
                          <span style={{ fontWeight: 'bold' }}>
                            {section.content.split('\n')[0]}
                          </span>
                          <br />
                          <span style={{ fontWeight: 'normal' }}>
                            {section.content.split('\n').slice(1).join('\n')}
                          </span>
                        </span>
                      ) : (
                        section.content
                      )}
                    </div>
                  ) : (
                    <div style={{ 
                      textAlign: 'center',
                      margin: '16px 0'
                    }}>
                      <img 
                        src={section.src} 
                        alt={section.alt}
                        style={{
                          maxWidth: '100%',
                          height: 'auto',
                          maxHeight: '300px',
                          borderRadius: '4px'
                        }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          
          <div style={{ 
            backgroundColor: '#FEF3C7', 
            padding: '16px', 
            borderRadius: '8px',
            border: '1px solid #F59E0B',
            marginTop: '16px'
          }}>
            <p style={{ fontSize: '14px', color: '#92400E', margin: 0 }}>
              💡 <strong>Gmail 사용법:</strong> Gmail 열기 → 텍스트 자동 입력됨 → 필요한 이미지를 수동으로 붙여넣기 (Ctrl+V)
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.mainCard}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <button
              onClick={() => setCurrentMedia('')}
              style={{
                ...styles.button,
                backgroundColor: '#F3F4F6',
                color: '#374151',
                padding: '8px 12px',
                marginRight: '16px'
              }}
            >
              ←
            </button>
            <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#1F2937', margin: 0 }}>
              {mediaList.find(m => m.id === currentMedia)?.name} 작성
            </h1>
          </div>
          <button
            onClick={saveCurrentData}
            style={{
              ...styles.button,
              backgroundColor: smartSaveSuccess ? '#10B981' : '#3B82F6',
              color: 'white'
            }}
            disabled={isLoading}
          >
            <span>🛡️</span>
            {smartSaveSuccess ? '안전 저장됨!' : '안전 저장'}
          </button>
        </div>

        {currentMedia === 'DA전체' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>총 광고비</label>
                <input
                  type="text"
                  value={reportData.daOverall.totalBudget}
                  onChange={(e) => setReportData(prev => ({
                    ...prev,
                    daOverall: { ...prev.daOverall, totalBudget: e.target.value }
                  }))}
                  placeholder="예: 7,829만원"
                  style={{ ...styles.input, width: '100%' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>가망자원</label>
                <input
                  type="text"
                  value={reportData.daOverall.totalLeads}
                  onChange={(e) => setReportData(prev => ({
                    ...prev,
                    daOverall: { ...prev.daOverall, totalLeads: e.target.value }
                  }))}
                  placeholder="예: 2,527건"
                  style={{ ...styles.input, width: '100%' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>가망CPA</label>
                <input
                  type="text"
                  value={reportData.daOverall.totalCPA}
                  onChange={(e) => setReportData(prev => ({
                    ...prev,
                    daOverall: { ...prev.daOverall, totalCPA: e.target.value }
                  }))}
                  placeholder="예: 3만원"
                  style={{ ...styles.input, width: '100%' }}
                />
              </div>
            </div>
            
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '16px' }}>성과 이미지 (최대 4장)</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
                  <ImageUploadSlot
                    image={reportData.daOverall.images && reportData.daOverall.images[0]}
                    onDelete={handleImageDelete}
                    onCheckboxChange={handleCheckboxChange}
                    onCaptionChange={handleCaptionChange}
                    onPaste={handleImagePaste}
                    section="daOverall"
                    media={null}
                    index={0}
                    isLarge={true}
                  />
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                  {[1, 2, 3].map(index => (
                    <ImageUploadSlot
                      key={index}
                      image={reportData.daOverall.images && reportData.daOverall.images[index]}
                      onDelete={handleImageDelete}
                      onCheckboxChange={handleCheckboxChange}
                      onCaptionChange={handleCaptionChange}
                      onPaste={handleImagePaste}
                      section="daOverall"
                      media={null}
                      index={index}
                      isLarge={false}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>첨부파일 안내 (선택사항)</label>
              <textarea
                value={reportData.attachmentNote}
                onChange={(e) => setReportData(prev => ({ ...prev, attachmentNote: e.target.value }))}
                placeholder="기본값: 리포트는 용량크기 상 대용량 첨부로 공유드립니다."
                style={{ 
                  ...styles.input, 
                  width: '100%', 
                  height: '100px', 
                  resize: 'vertical',
                  fontFamily: 'inherit'
                }}
              />
            </div>
          </div>
        )}

        {currentMedia !== 'DA전체' && currentMedia !== '제휴' && currentMedia !== '미리보기' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
              <input
                type="checkbox"
                id="noUpdate"
                checked={reportData.mediaDetails[currentMedia]?.noUpdate || false}
                onChange={(e) => setReportData(prev => ({
                  ...prev,
                  mediaDetails: {
                    ...prev.mediaDetails,
                    [currentMedia]: { 
                      ...prev.mediaDetails[currentMedia], 
                      noUpdate: e.target.checked,
                      content: e.target.checked ? '' : prev.mediaDetails[currentMedia]?.content || ''
                    }
                  }
                }))}
                style={{ marginRight: '8px', width: '16px', height: '16px' }}
              />
              <label htmlFor="noUpdate" style={{ fontSize: '14px', fontWeight: '500', color: '#374151' }}>
                특이사항 없음 (확인 완료)
              </label>
            </div>
            
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>매체 코멘트</label>
              <textarea
                value={reportData.mediaDetails[currentMedia]?.content || ''}
                onChange={(e) => setReportData(prev => ({
                  ...prev,
                  mediaDetails: {
                    ...prev.mediaDetails,
                    [currentMedia]: { 
                      ...prev.mediaDetails[currentMedia], 
                      content: e.target.value,
                      noUpdate: false
                    }
                  }
                }))}
                placeholder={`${currentMedia} 코멘트를 입력하세요...`}
                style={{ 
                  ...styles.input, 
                  width: '100%', 
                  height: '200px', 
                  resize: 'vertical',
                  backgroundColor: reportData.mediaDetails[currentMedia]?.noUpdate ? '#F9FAFB' : 'white',
                  fontFamily: 'inherit'
                }}
                disabled={reportData.mediaDetails[currentMedia]?.noUpdate}
              />
              {reportData.mediaDetails[currentMedia]?.noUpdate && (
                <p style={{ fontSize: '14px', color: '#D97706', marginTop: '8px' }}>
                  ✓ 특이사항 없음으로 설정됨. 체크를 해제하면 코멘트를 작성할 수 있습니다.
                </p>
              )}
            </div>
            
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '16px' }}>매체 이미지 (최대 4장)</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
                  <ImageUploadSlot
                    image={reportData.mediaDetails[currentMedia]?.images && reportData.mediaDetails[currentMedia].images[0]}
                    onDelete={handleImageDelete}
                    onCheckboxChange={handleCheckboxChange}
                    onCaptionChange={handleCaptionChange}
                    onPaste={handleImagePaste}
                    section="mediaDetails"
                    media={currentMedia}
                    index={0}
                    isLarge={true}
                    disabled={reportData.mediaDetails[currentMedia]?.noUpdate}
                  />
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                  {[1, 2, 3].map(index => (
                    <ImageUploadSlot
                      key={index}
                      image={reportData.mediaDetails[currentMedia]?.images && reportData.mediaDetails[currentMedia].images[index]}
                      onDelete={handleImageDelete}
                      onCheckboxChange={handleCheckboxChange}
                      onCaptionChange={handleCaptionChange}
                      onPaste={handleImagePaste}
                      section="mediaDetails"
                      media={currentMedia}
                      index={index}
                      isLarge={false}
                      disabled={reportData.mediaDetails[currentMedia]?.noUpdate}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {currentMedia === '제휴' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>총 광고비</label>
                <input
                  type="text"
                  value={reportData.partnership.totalBudget}
                  onChange={(e) => setReportData(prev => ({
                    ...prev,
                    partnership: { ...prev.partnership, totalBudget: e.target.value }
                  }))}
                  placeholder="예: 2,642만원"
                  style={{ ...styles.input, width: '100%' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>가망자원</label>
                <input
                  type="text"
                  value={reportData.partnership.totalLeads}
                  onChange={(e) => setReportData(prev => ({
                    ...prev,
                    partnership: { ...prev.partnership, totalLeads: e.target.value }
                  }))}
                  placeholder="예: 1,279건"
                  style={{ ...styles.input, width: '100%' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>가망CPA</label>
                <input
                  type="text"
                  value={reportData.partnership.totalCPA}
                  onChange={(e) => setReportData(prev => ({
                    ...prev,
                    partnership: { ...prev.partnership, totalCPA: e.target.value }
                  }))}
                  placeholder="예: 1.9만원"
                  style={{ ...styles.input, width: '100%' }}
                />
              </div>
            </div>
            
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>제휴 상세 내용</label>
              <textarea
                value={reportData.partnership.details}
                onChange={(e) => setReportData(prev => ({
                  ...prev,
                  partnership: { ...prev.partnership, details: e.target.value }
                }))}
                placeholder="제휴 상세 내용을 입력하세요..."
                style={{ 
                  ...styles.input, 
                  width: '100%', 
                  height: '200px', 
                  resize: 'vertical',
                  fontFamily: 'inherit'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>금주 MKT 플랜</label>
              <textarea
                value={reportData.partnership.weeklyPlan}
                onChange={(e) => setReportData(prev => ({
                  ...prev,
                  partnership: { ...prev.partnership, weeklyPlan: e.target.value }
                }))}
                placeholder="금주 마케팅 계획을 입력하세요..."
                style={{ 
                  ...styles.input, 
                  width: '100%', 
                  height: '120px', 
                  resize: 'vertical',
                  fontFamily: 'inherit'
                }}
              />
            </div>
            
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '16px' }}>제휴 이미지 (최대 4장)</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
                  <ImageUploadSlot
                    image={reportData.partnership.images && reportData.partnership.images[0]}
                    onDelete={handleImageDelete}
                    onCheckboxChange={handleCheckboxChange}
                    onCaptionChange={handleCaptionChange}
                    onPaste={handleImagePaste}
                    section="partnership"
                    media={null}
                    index={0}
                    isLarge={true}
                  />
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                  {[1, 2, 3].map(index => (
                    <ImageUploadSlot
                      key={index}
                      image={reportData.partnership.images && reportData.partnership.images[index]}
                      onDelete={handleImageDelete}
                      onCheckboxChange={handleCheckboxChange}
                      onCaptionChange={handleCaptionChange}
                      onPaste={handleImagePaste}
                      section="partnership"
                      media={null}
                      index={index}
                      isLarge={false}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {popupImage && (
          <div 
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999,
              cursor: 'pointer'
            }}
            onClick={closePopup}
          >
            <div style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }}>
              <img 
                src={popupImage}
                alt="확대 보기"
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  borderRadius: '8px',
                  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
                }}
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closePopup();
                }}
                style={{
                  position: 'absolute',
                  top: '10px',
                  right: '10px',
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(0, 0, 0, 0.7)',
                  color: 'white',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 'bold'
                }}
                title="닫기"
              >
                ×
              </button>
            </div>
            <div style={{
              position: 'absolute',
              bottom: '20px',
              left: '50%',
              transform: 'translateX(-50%)',
              color: 'white',
              fontSize: '14px',
              opacity: 0.8
            }}>
              클릭하거나 ESC를 눌러 닫기
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DailyReportPlatform;