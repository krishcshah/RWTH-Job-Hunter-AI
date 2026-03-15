import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ModuleRegistry, AllCommunityModule, themeQuartz } from 'ag-grid-community';
import { Upload, Search, Sparkles, Download, Loader2, AlertCircle, CheckCircle, Filter } from 'lucide-react';
import { db } from './firebase';
import { collection, doc, setDoc, onSnapshot } from 'firebase/firestore';

ModuleRegistry.registerModules([AllCommunityModule]);

interface Job {
  srNumber: string;
  url: string;
  title: string;
  anbieter: string;
  unserProfil: string;
  ihrProfil: string;
  ihreAufgaben: string;
  unserAngebot: string;
  uberUns: string;
  bewerbung: string;
  email: string;
}

export default function App() {
  const [resumeText, setResumeText] = useState<string>('');
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isScraping, setIsScraping] = useState(false);
  const [hasScraped, setHasScraped] = useState(false);
  const [scrapeProgress, setScrapeProgress] = useState({ current: 0, total: 0 });
  
  const [isMatching, setIsMatching] = useState(false);
  const [matchProgress, setMatchProgress] = useState({ current: 0, total: 0 });
  const [recommendedSrNumbers, setRecommendedSrNumbers] = useState<string[]>([]);
  const [showOnlyRecommended, setShowOnlyRecommended] = useState(false);
  
  const [apiKey, setApiKey] = useState<string>('');
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  
  const [error, setError] = useState<string | null>(null);

  const [shouldAutoScrape, setShouldAutoScrape] = useState(false);
  const [shouldAutoMatch, setShouldAutoMatch] = useState(false);

  const gridRef = useRef<AgGridReact>(null);

  // Load jobs from Firestore
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'jobs'),
      (snapshot) => {
        const loadedJobs: Job[] = [];
        snapshot.forEach((doc) => {
          loadedJobs.push(doc.data() as Job);
        });
        setJobs(loadedJobs);
      },
      (err) => {
        console.error('Firestore Error: ', err);
        setError('Failed to load jobs from database.');
      }
    );

    return () => unsubscribe();
  }, []);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setResumeFile(file);
    setIsUploading(true);
    setError(null);
    
    const formData = new FormData();
    formData.append('resume', file);
    
    try {
      const response = await fetch('/api/upload-resume', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) throw new Error('Failed to parse resume');
      
      const data = await response.json();
      setResumeText(data.text);
      setShouldAutoScrape(true);
    } catch (err: any) {
      setError(err.message || 'Error uploading resume');
    } finally {
      setIsUploading(false);
    }
  };

  const handleScrapeJobs = async () => {
    setIsScraping(true);
    setError(null);
    
    try {
      // 1. Get all job URLs
      const listResponse = await fetch('/api/jobs');
      if (!listResponse.ok) throw new Error('Failed to fetch job list');
      const listData = await listResponse.json();
      const urls: string[] = listData.urls || [];
      
      if (urls.length === 0) {
        throw new Error('No jobs found on the portal');
      }

      const cachedUrls = new Set(jobs.map(j => j.url));

      const newUrls = urls.filter(url => !cachedUrls.has(url));
      
      if (newUrls.length > 0) {
        setScrapeProgress({ current: 0, total: newUrls.length });
        
        // 2. Scrape details in batches to avoid overwhelming the server/target
        const batchSize = 10;
        
        for (let i = 0; i < newUrls.length; i += batchSize) {
          const batchUrls = newUrls.slice(i, i + batchSize);
          const detailsResponse = await fetch('/api/jobs/details', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ urls: batchUrls }),
          });
          
          if (!detailsResponse.ok) throw new Error('Failed to fetch job details');
          const detailsData = await detailsResponse.json();
          
          const newJobs: Job[] = detailsData.jobs;
          
          // Save to Firestore
          for (const job of newJobs) {
            try {
              await setDoc(doc(db, 'jobs', job.srNumber), job);
            } catch (err) {
              console.error('Failed to save job to Firestore', err);
            }
          }
          
          setScrapeProgress({ current: Math.min(i + batchSize, newUrls.length), total: newUrls.length });
          
          // Rate limiting: wait 1 second between batches
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      setHasScraped(true);
      return true;
    } catch (err: any) {
      setError(err.message || 'Error scraping jobs');
      return false;
    } finally {
      setIsScraping(false);
    }
  };

  const handleMatchJobs = async () => {
    if (!resumeText) {
      setError('Please upload a resume first.');
      return;
    }
    if (jobs.length === 0) {
      setError('Please scrape jobs first.');
      return;
    }
    if (!apiKey) {
      setShowApiKeyInput(true);
      return;
    }
    
    setIsMatching(true);
    setError(null);
    setRecommendedSrNumbers([]);
    
    try {
      const batchSize = 10;
      const allMatched: string[] = [];
      setMatchProgress({ current: 0, total: jobs.length });
      
      for (let i = 0; i < jobs.length; i += batchSize) {
        const batchJobs = jobs.slice(i, i + batchSize);
        
        const response = await fetch('/api/match-jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ resumeText, jobs: batchJobs, apiKey }),
        });
        
        if (!response.ok) throw new Error('Failed to match jobs');
        const data = await response.json();
        
        allMatched.push(...(data.matchedSrNumbers || []));
        setRecommendedSrNumbers(Array.from(new Set(allMatched)));
        setMatchProgress({ current: Math.min(i + batchSize, jobs.length), total: jobs.length });
      }
      
      setShowOnlyRecommended(true);
      setShowApiKeyInput(false);
    } catch (err: any) {
      setError(err.message || 'Error matching jobs');
      if (err.message === 'Failed to match jobs') {
        setShowApiKeyInput(true);
      }
    } finally {
      setIsMatching(false);
    }
  };

  useEffect(() => {
    if (shouldAutoScrape && resumeText) {
      setShouldAutoScrape(false);
      handleScrapeJobs().then(success => {
        if (success) setShouldAutoMatch(true);
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldAutoScrape, resumeText]);

  useEffect(() => {
    if (shouldAutoMatch && jobs.length > 0) {
      setShouldAutoMatch(false);
      handleMatchJobs();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldAutoMatch, jobs.length]);

  const handleDownloadCsv = useCallback(() => {
    if (gridRef.current) {
      gridRef.current.api.exportDataAsCsv({
        fileName: showOnlyRecommended ? 'recommended_jobs.csv' : 'all_jobs.csv',
      });
    }
  }, [showOnlyRecommended]);

  const columnDefs = useMemo(() => [
    { 
      headerName: 'SR Number', 
      field: 'srNumber', 
      width: 120, 
      pinned: 'left' as const,
      filter: 'agTextColumnFilter'
    },
    { 
      headerName: 'Job Title', 
      field: 'title', 
      width: 300, 
      pinned: 'left' as const,
      filter: 'agTextColumnFilter',
      tooltipField: 'title'
    },
    { 
      headerName: 'Action', 
      field: 'url', 
      width: 150, 
      pinned: 'left' as const,
      cellRenderer: (params: any) => (
        <a 
          href={params.value} 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-blue-600 hover:text-blue-800 underline text-sm font-medium"
        >
          Open in new tab
        </a>
      )
    },
    { headerName: 'Anbieter', field: 'anbieter', width: 200, filter: 'agTextColumnFilter' },
    { headerName: 'Ihr Profil', field: 'ihrProfil', width: 400, tooltipField: 'ihrProfil' },
    { headerName: 'Ihre Aufgaben', field: 'ihreAufgaben', width: 400, tooltipField: 'ihreAufgaben' },
    { headerName: 'Unser Angebot', field: 'unserAngebot', width: 300 },
    { headerName: 'Über uns', field: 'uberUns', width: 300 },
    { headerName: 'Bewerbung', field: 'bewerbung', width: 200 },
    { headerName: 'E-Mail', field: 'email', width: 200 },
  ], []);

  const defaultColDef = useMemo(() => ({
    sortable: true,
    resizable: true,
  }), []);

  const rowData = useMemo(() => {
    if (showOnlyRecommended) {
      return jobs.filter(job => recommendedSrNumbers.includes(job.srNumber));
    }
    return jobs;
  }, [jobs, showOnlyRecommended, recommendedSrNumbers]);

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-sans text-slate-900">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
          <h1 className="text-3xl font-bold tracking-tight mb-2">RWTH Job Hunter AI</h1>
          <p className="text-slate-500">Automate your job search with intelligent scraping and AI matching.</p>
        </div>

        {/* Controls */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Step 1: Resume */}
          <div className={`p-6 rounded-2xl shadow-sm border flex flex-col transition-colors ${resumeText ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200'}`}>
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              {resumeText ? (
                <CheckCircle className="w-6 h-6 text-emerald-600" />
              ) : (
                <span className="bg-slate-100 text-slate-600 w-6 h-6 rounded-full flex items-center justify-center text-sm">1</span>
              )}
              Upload Resume
            </h2>
            <div className="flex-1 flex flex-col justify-center">
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-slate-300 border-dashed rounded-xl cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  {isUploading ? (
                    <Loader2 className="w-8 h-8 text-slate-400 animate-spin mb-2" />
                  ) : (
                    <Upload className="w-8 h-8 text-slate-400 mb-2" />
                  )}
                  <p className="text-sm text-slate-500 font-medium">
                    {resumeFile ? resumeFile.name : 'Click to upload PDF'}
                  </p>
                </div>
                <input type="file" className="hidden" accept=".pdf" onChange={handleFileUpload} disabled={isUploading} />
              </label>
              {resumeText && (
                <p className="text-xs text-emerald-600 mt-3 font-medium flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Resume parsed successfully
                </p>
              )}
            </div>
          </div>

          {/* Step 2: Scrape */}
          <div className={`p-6 rounded-2xl shadow-sm border flex flex-col transition-colors ${hasScraped && !isScraping ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200'}`}>
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              {hasScraped && !isScraping ? (
                <CheckCircle className="w-6 h-6 text-emerald-600" />
              ) : (
                <span className="bg-slate-100 text-slate-600 w-6 h-6 rounded-full flex items-center justify-center text-sm">2</span>
              )}
              Scrape Job Board
            </h2>
            <div className="flex-1 flex flex-col justify-center space-y-4">
              <button
                onClick={handleScrapeJobs}
                disabled={isScraping}
                className="w-full py-3 px-4 bg-slate-900 text-white rounded-xl font-medium hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {isScraping ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                {isScraping ? 'Scraping...' : 'Fetch RWTH Jobs'}
              </button>
              
              {isScraping && scrapeProgress.total > 0 && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-medium text-slate-500">
                    <span>Progress</span>
                    <span>{scrapeProgress.current} / {scrapeProgress.total}</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div 
                      className="bg-slate-900 h-2 rounded-full transition-all duration-300" 
                      style={{ width: `${(scrapeProgress.current / scrapeProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}
              {!isScraping && jobs.length > 0 && (
                <p className="text-xs text-slate-500 font-medium text-center">
                  Found {jobs.length} jobs
                </p>
              )}
            </div>
          </div>

          {/* Step 3: Match */}
          <div className={`p-6 rounded-2xl shadow-sm border flex flex-col transition-colors ${recommendedSrNumbers.length > 0 && !isMatching ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200'}`}>
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              {recommendedSrNumbers.length > 0 && !isMatching ? (
                <CheckCircle className="w-6 h-6 text-emerald-600" />
              ) : (
                <span className="bg-slate-100 text-slate-600 w-6 h-6 rounded-full flex items-center justify-center text-sm">3</span>
              )}
              AI Matching
            </h2>
            <div className="flex-1 flex flex-col justify-center space-y-4">
              <button
                onClick={handleMatchJobs}
                disabled={isMatching || !resumeText || jobs.length === 0}
                className="w-full py-3 px-4 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {isMatching ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                {isMatching ? 'Analyzing Fit...' : 'Resume Recommended'}
              </button>
              
              {isMatching && matchProgress.total > 0 && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-medium text-indigo-600">
                    <span>Analyzing</span>
                    <span>{matchProgress.current} / {matchProgress.total}</span>
                  </div>
                  <div className="w-full bg-indigo-100 rounded-full h-2 overflow-hidden">
                    <div 
                      className="bg-indigo-600 h-2 rounded-full transition-all duration-300" 
                      style={{ width: `${(matchProgress.current / matchProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}
              
              {!isMatching && recommendedSrNumbers.length > 0 && (
                <p className="text-xs text-emerald-600 font-medium text-center mt-2">
                  Found {recommendedSrNumbers.length} matches
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        {/* Data Grid */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col h-[600px]">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">
              Job Listings {rowData.length > 0 && <span className="text-slate-400 font-normal text-sm ml-2">({rowData.length} results)</span>}
            </h2>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowOnlyRecommended(!showOnlyRecommended)}
                disabled={recommendedSrNumbers.length === 0}
                className={`py-2 px-4 rounded-lg font-medium transition-colors flex items-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed ${showOnlyRecommended ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
              >
                <Filter className="w-4 h-4" />
                Resume Match Filter: {showOnlyRecommended ? 'On' : 'Off'}
              </button>
              <button
                onClick={handleDownloadCsv}
                disabled={rowData.length === 0}
                className="py-2 px-4 bg-slate-100 text-slate-700 rounded-lg font-medium hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 text-sm"
              >
                <Download className="w-4 h-4" />
                Download CSV
              </button>
            </div>
          </div>
          
          <div className="flex-1 w-full">
            <AgGridReact
              ref={gridRef}
              theme={themeQuartz}
              rowData={rowData}
              columnDefs={columnDefs}
              defaultColDef={defaultColDef}
              rowSelection="multiple"
              animateRows={true}
              enableCellTextSelection={true}
              tooltipShowDelay={500}
            />
          </div>
        </div>

      </div>

      {/* API Key Modal */}
      {showApiKeyInput && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl">
            <h3 className="text-xl font-bold mb-2">Gemini API Key Required</h3>
            <p className="text-slate-500 text-sm mb-4">
              To use the AI matching feature, please provide your Gemini API key. Your key is only sent to the backend for this request and is not stored permanently.
            </p>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter your Gemini API key"
              className="w-full px-4 py-2 border border-slate-300 rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowApiKeyInput(false)}
                className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowApiKeyInput(false);
                  if (apiKey) handleMatchJobs();
                }}
                disabled={!apiKey}
                className="px-4 py-2 bg-indigo-600 text-white font-medium hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
