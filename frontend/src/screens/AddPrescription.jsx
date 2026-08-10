import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Upload, FileText, Pill, CheckCircle2, Sunrise, Sun, Moon, Utensils, AlertTriangle, ShieldCheck, FileCheck, Eye, Brain, Activity, Syringe, Heart, ClipboardList, ChevronDown, ChevronUp, Sparkles, BarChart3, X, FileCode } from 'lucide-react';
import api from '../services/api';
import { showToast } from '../components/Toast';

// Document type icon and color mapping
const DOC_TYPE_CONFIG = {
  prescription: { icon: Pill, color: '#6366f1', bg: '#eef2ff' },
  blood_test: { icon: Activity, color: '#ef4444', bg: '#fef2f2' },
  urine_test: { icon: FileText, color: '#f59e0b', bg: '#fffbeb' },
  ultrasound: { icon: Eye, color: '#06b6d4', bg: '#ecfeff' },
  xray: { icon: FileCheck, color: '#8b5cf6', bg: '#f5f3ff' },
  mri: { icon: Brain, color: '#3b82f6', bg: '#eff6ff' },
  ct_scan: { icon: Brain, color: '#10b981', bg: '#ecfdf5' },
  ecg: { icon: Heart, color: '#ec4899', bg: '#fdf2f8' },
  discharge_summary: { icon: ClipboardList, color: '#14b8a6', bg: '#f0fdfa' },
  vaccination: { icon: Syringe, color: '#22c55e', bg: '#f0fdf4' },
  medical_certificate: { icon: FileCheck, color: '#64748b', bg: '#f8fafc' },
  unknown: { icon: FileText, color: '#94a3b8', bg: '#f1f5f9' },
};

export default function AddPrescription() {
  const [activeTab, setActiveTab] = useState('prescription'); // 'prescription' or 'report'
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [processingStage, setProcessingStage] = useState(''); // 'Uploading...', 'OCR Processing...', 'AI Document Classification...', 'Extraction...'
  const [errorMessage, setErrorMessage] = useState('');
  const [lowConfidenceWarning, setLowConfidenceWarning] = useState('');

  // Prescription OCR state
  const [extractedData, setExtractedData] = useState(null);
  const [prescriptionId, setPrescriptionId] = useState(null);
  const [confidenceScore, setConfidenceScore] = useState(90.0);
  const [doctorInstructions, setDoctorInstructions] = useState('');
  const [doctorNotes, setDoctorNotes] = useState('');

  // Phase 5: Smart Classification State
  const [documentType, setDocumentType] = useState('prescription');
  const [documentLabel, setDocumentLabel] = useState('Doctor Prescription');
  const [classificationConfidence, setClassificationConfidence] = useState(0);
  const [ocrConfidence, setOcrConfidence] = useState(0);
  const [aiSummary, setAiSummary] = useState('');
  const [showSummary, setShowSummary] = useState(false);

  // Lab Report state
  const [labReportId, setLabReportId] = useState(null);
  const [extractedLabValues, setExtractedLabValues] = useState(null);

  const fileInputRef = useRef(null);
  const navigate = useNavigate();

  const handleFileChange = async (e) => {
    if (!e.target.files || !e.target.files[0]) return;

    const selectedFile = e.target.files[0];
    setErrorMessage('');
    setLowConfidenceWarning('');
    setExtractedData(null);
    setExtractedLabValues(null);

    // 1. Validate File Format
    const allowedExtensions = ['jpg', 'jpeg', 'png', 'webp', 'pdf', 'bmp'];
    const ext = selectedFile.name.split('.').pop().toLowerCase();
    if (!allowedExtensions.includes(ext)) {
      const errStr = `Invalid file format (.${ext}). Please select a JPG, PNG, WEBP, or PDF file.`;
      setErrorMessage(errStr);
      showToast(errStr, 'error');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // 2. Validate File Size (Max 15MB)
    const maxSizeMB = 15;
    if (selectedFile.size > maxSizeMB * 1024 * 1024) {
      const fileMB = (selectedFile.size / (1024 * 1024)).toFixed(1);
      const errStr = `File size (${fileMB}MB) exceeds the ${maxSizeMB}MB limit. Please upload a smaller file.`;
      setErrorMessage(errStr);
      showToast(errStr, 'error');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // Save File state & Create Preview
    setFile(selectedFile);
    if (selectedFile.type.startsWith('image/')) {
      setPreviewUrl(URL.createObjectURL(selectedFile));
    } else {
      setPreviewUrl(null);
    }

    console.log('✔ Step 1: File selected');
    console.log(`  File Name: ${selectedFile.name}`);
    console.log(`  File Size: ${(selectedFile.size / 1024).toFixed(2)} KB`);
    console.log(`  File Type: ${selectedFile.type || ext}`);

    // 3. Automatic Upload Pipeline with Explicit Stages
    setLoading(true);
    setUploadProgress(15);

    try {
      // Stage 1: Uploading...
      setProcessingStage('Uploading...');
      await new Promise(r => setTimeout(r, 400));
      setUploadProgress(40);

      // Stage 2: OCR Processing...
      setProcessingStage('OCR Processing...');
      await new Promise(r => setTimeout(r, 400));
      setUploadProgress(65);

      // Stage 3: AI Document Classification...
      setProcessingStage('AI Document Classification...');
      await new Promise(r => setTimeout(r, 400));
      setUploadProgress(85);

      // Stage 4: Extraction...
      setProcessingStage('Extraction...');

      const formData = new FormData();
      formData.append('image', selectedFile);
      formData.append('file', selectedFile);
      formData.append('pdf_file', selectedFile);

      if (activeTab === 'prescription') {
        const data = await api.post('/api/prescriptions/upload/', formData);
        setUploadProgress(100);

        setPrescriptionId(data.prescription_id);
        setConfidenceScore(data.confidence_score || 90.0);
        setDoctorInstructions(data.doctor_instructions || '');
        setDoctorNotes(data.doctor_notes || '');

        setDocumentType(data.document_type || 'prescription');
        setDocumentLabel(data.document_label || 'Doctor Prescription');
        setClassificationConfidence(data.classification_confidence || 0);
        setOcrConfidence(data.ocr_confidence || 0);
        setAiSummary(data.ai_summary || '');

        setExtractedData(data.extracted_data || {});

        // Show low confidence warning ONLY after OCR completes if confidence is poor
        if (data.ocr_confidence < 50 || data.confidence_score < 70 || data.status === 'review_required') {
          setLowConfidenceWarning(data.message || 'Low OCR confidence. Please verify extracted fields carefully.');
        }

        showToast(`${data.document_label || 'Document'} processed successfully!`, 'success');
      } else {
        const data = await api.post('/api/reports/upload/', formData);
        setUploadProgress(100);
        setLabReportId(data.report_id);
        setExtractedLabValues(data.extracted_values || []);
        showToast('Lab report analyzed successfully!', 'success');
      }
    } catch (err) {
      console.error('Upload Error:', err);
      // Display actual backend error instead of generic message
      const actualError = err.message || 'Upload failed. Could not communicate with server.';
      setErrorMessage(actualError);
      showToast(actualError, 'error');
      setExtractedData(null);
      setExtractedLabValues(null);
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleConfirmPrescription = async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/prescriptions/confirm/', {
        prescription_id: prescriptionId,
        medication: {
          ...extractedData,
          doctor_instructions: doctorInstructions,
          doctor_notes: doctorNotes
        }
      });
      showToast('Prescription saved & automated reminder schedule created!', 'success');
      navigate('/home');
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Could not save prescription details.', 'error');
    }
  };

  const handleConfirmLabReport = async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/reports/confirm/', {
        report_id: labReportId,
        values: extractedLabValues
      });
      showToast('Lab report saved & health metrics correlated!', 'success');
      navigate('/dashboard');
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Error saving lab report.', 'error');
    }
  };

  const clearSelectedFile = () => {
    setFile(null);
    setPreviewUrl(null);
    setErrorMessage('');
    setLowConfidenceWarning('');
    setExtractedData(null);
    setExtractedLabValues(null);
  };

  // ── Confidence Bar Component ──
  const ConfidenceBar = ({ label, value, icon: Icon, color }) => (
    <div style={{ flex: 1, minWidth: '140px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
        <Icon size={13} color={color} />
        <span style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)' }}>{label}</span>
      </div>
      <div style={{ background: 'var(--bg-subtle)', borderRadius: '6px', height: '8px', overflow: 'hidden' }}>
        <div style={{
          width: `${Math.min(100, Math.max(0, value))}%`,
          height: '100%',
          borderRadius: '6px',
          background: value > 75 ? 'linear-gradient(90deg, #22c55e, #16a34a)' :
                      value > 50 ? 'linear-gradient(90deg, #f59e0b, #d97706)' :
                                   'linear-gradient(90deg, #ef4444, #dc2626)',
          transition: 'width 0.8s ease'
        }} />
      </div>
      <span style={{ fontSize: '11px', fontWeight: '700', color: value > 75 ? '#16a34a' : value > 50 ? '#d97706' : '#dc2626' }}>
        {Math.round(value)}%
      </span>
    </div>
  );

  // ── Uploading Progress Animation Screen ──
  if (loading) {
    const STAGES = [
      'Uploading...',
      'OCR Processing...',
      'AI Document Classification...',
      'Extraction...'
    ];
    const currentIdx = STAGES.findIndex(s => s === processingStage);

    return (
      <div className="page-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div className="spinner"></div>

        {/* Selected File Preview Box during upload */}
        {file && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '10px 16px', borderRadius: '12px', background: 'var(--bg-card)',
            border: '1px solid var(--border-color)', marginTop: '16px', fontSize: '13px'
          }}>
            {previewUrl ? (
              <img src={previewUrl} alt="Preview" style={{ width: '32px', height: '32px', objectFit: 'cover', borderRadius: '6px' }} />
            ) : (
              <FileCode size={24} color="var(--primary-color)" />
            )}
            <div>
              <div style={{ fontWeight: '700', color: 'var(--text-main)' }}>{file.name}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                {(file.size / (1024 * 1024)).toFixed(2)} MB
              </div>
            </div>
          </div>
        )}

        <h2 style={{ marginTop: '20px', fontSize: '22px', fontWeight: '800', color: 'var(--primary-color)' }}>
          {processingStage}
        </h2>

        {/* Progress Bar */}
        <div style={{ width: '100%', maxWidth: '340px', background: 'var(--bg-subtle)', borderRadius: '8px', height: '8px', margin: '14px 0', overflow: 'hidden' }}>
          <div style={{
            width: `${uploadProgress}%`, height: '100%',
            background: 'var(--primary-gradient)', borderRadius: '8px',
            transition: 'width 0.4s ease'
          }} />
        </div>

        {/* Stage Pills */}
        <div style={{ display: 'flex', gap: '6px', marginTop: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
          {STAGES.map((stage, idx) => {
            const isDone = idx < currentIdx;
            const isCurrent = idx === currentIdx;
            return (
              <span key={idx} className={`badge ${isDone ? 'badge-green' : isCurrent ? 'badge-blue' : 'badge-blue'}`} style={{
                fontSize: '12px',
                padding: '5px 12px',
                opacity: idx <= currentIdx ? 1 : 0.4,
                fontWeight: isCurrent ? '800' : '600'
              }}>
                {idx + 1}. {stage}
              </span>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Review & Confirm Prescription Form Screen ──
  if (extractedData && activeTab === 'prescription') {
    const docConfig = DOC_TYPE_CONFIG[documentType] || DOC_TYPE_CONFIG.unknown;
    const DocIcon = docConfig.icon;

    return (
      <div className="page-container" style={{ maxWidth: '680px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h1 style={{ fontSize: '26px', fontWeight: '800', margin: 0, color: 'var(--text-main)' }}>Review Extracted Data</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: '4px 0 0' }}>AI detected document fields. Verify or edit before saving.</p>
          </div>

          <span className={`badge ${confidenceScore > 80 ? 'badge-green' : 'badge-amber'}`} style={{ fontSize: '13px', padding: '6px 12px' }}>
            <ShieldCheck size={14} style={{ marginRight: '4px' }} />
            {confidenceScore > 80 ? `High Confidence (${Math.round(confidenceScore)}%)` : `Review Suggested (${Math.round(confidenceScore)}%)`}
          </span>
        </div>

        {/* Selected File Preview Banner */}
        {file && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 16px', borderRadius: '12px', background: 'var(--bg-card)',
            border: '1px solid var(--border-color)', marginBottom: '16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {previewUrl ? (
                <img src={previewUrl} alt="Preview" style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '8px' }} />
              ) : (
                <FileCode size={28} color="var(--primary-color)" />
              )}
              <div>
                <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-main)' }}>{file.name}</span>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginLeft: '8px' }}>
                  ({(file.size / (1024 * 1024)).toFixed(2)} MB)
                </span>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-outline"
              style={{ padding: '6px 12px', fontSize: '12px' }}
              onClick={clearSelectedFile}
            >
              Upload Different File
            </button>
          </div>
        )}

        {/* ── Document Type Classification Badge ── */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '14px 18px',
          borderRadius: '14px',
          background: docConfig.bg,
          border: `1px solid ${docConfig.color}22`,
          marginBottom: '16px'
        }}>
          <div style={{
            width: '42px', height: '42px', borderRadius: '12px',
            background: `${docConfig.color}18`, display: 'flex',
            alignItems: 'center', justifyContent: 'center'
          }}>
            <DocIcon size={22} color={docConfig.color} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '15px', fontWeight: '700', color: docConfig.color }}>{documentLabel}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              AI classified this document with {Math.round(classificationConfidence)}% confidence
            </div>
          </div>
          <Sparkles size={18} color={docConfig.color} style={{ opacity: 0.6 }} />
        </div>

        {/* ── Confidence Bars ── */}
        <div style={{
          display: 'flex', gap: '16px', padding: '14px 18px',
          borderRadius: '14px', background: 'var(--bg-card)',
          border: '1px solid var(--border-color)', marginBottom: '16px',
          flexWrap: 'wrap'
        }}>
          <ConfidenceBar label="OCR Quality" value={ocrConfidence} icon={Eye} color="#3b82f6" />
          <ConfidenceBar label="Classification" value={classificationConfidence} icon={BarChart3} color="#8b5cf6" />
          <ConfidenceBar label="Extraction" value={confidenceScore} icon={Sparkles} color="#22c55e" />
        </div>

        {/* Low Confidence Warning — Shown ONLY AFTER OCR completes */}
        {lowConfidenceWarning && (
          <div style={{ background: 'var(--warning-light)', color: '#b45309', padding: '12px 16px', borderRadius: '12px', marginBottom: '20px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={18} />
            <span>{lowConfidenceWarning}</span>
          </div>
        )}

        <div className="card">
          <form onSubmit={handleConfirmPrescription}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
              <div className="input-group">
                <label className="input-label">Medicine Name</label>
                <input
                  type="text"
                  className="input-field"
                  value={extractedData.name || ''}
                  onChange={e => setExtractedData({ ...extractedData, name: e.target.value })}
                  required
                />
              </div>

              <div className="input-group">
                <label className="input-label">Dosage (e.g. 500mg, 10ml)</label>
                <input
                  type="text"
                  className="input-field"
                  value={extractedData.dosage || ''}
                  onChange={e => setExtractedData({ ...extractedData, dosage: e.target.value })}
                  required
                />
              </div>

              <div className="input-group">
                <label className="input-label">Frequency (e.g. 1-0-1, Twice Daily)</label>
                <input
                  type="text"
                  className="input-field"
                  value={extractedData.frequency || ''}
                  onChange={e => setExtractedData({ ...extractedData, frequency: e.target.value })}
                  required
                />
              </div>

              <div className="input-group">
                <label className="input-label">Duration (Days)</label>
                <input
                  type="number"
                  className="input-field"
                  value={extractedData.duration || 7}
                  onChange={e => setExtractedData({ ...extractedData, duration: e.target.value })}
                  required
                />
              </div>

              <div className="input-group">
                <label className="input-label">Total Quantity / Tablets</label>
                <input
                  type="number"
                  className="input-field"
                  value={extractedData.total_tablets || 30}
                  onChange={e => setExtractedData({ ...extractedData, total_tablets: e.target.value })}
                  required
                />
              </div>

              <div className="input-group">
                <label className="input-label">Category</label>
                <input
                  type="text"
                  className="input-field"
                  value={extractedData.category || 'General'}
                  onChange={e => setExtractedData({ ...extractedData, category: e.target.value })}
                />
              </div>
            </div>

            {/* Food Instruction Radios */}
            <div style={{ margin: '16px 0' }}>
              <label className="input-label" style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Utensils size={16} color="var(--primary-color)" /> Food Instruction
              </label>
              <div style={{ display: 'flex', gap: '20px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="food"
                    checked={!extractedData.before_food}
                    onChange={() => setExtractedData({ ...extractedData, before_food: false, after_food: true })}
                  />
                  <span>After Food</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="food"
                    checked={Boolean(extractedData.before_food)}
                    onChange={() => setExtractedData({ ...extractedData, before_food: true, after_food: false })}
                  />
                  <span>Before Food</span>
                </label>
              </div>
            </div>

            {/* Schedule Slot Timing Checkboxes + Time Pickers */}
            <div style={{ margin: '20px 0' }}>
              <label className="input-label" style={{ marginBottom: '8px' }}>Automated Reminder Slots</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px', borderRadius: '10px', background: 'var(--bg-subtle)' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '14px', flex: '1' }}>
                    <input
                      type="checkbox"
                      checked={Boolean(extractedData.morning)}
                      onChange={e => setExtractedData({ ...extractedData, morning: e.target.checked })}
                    />
                    <Sunrise size={18} color="#f97316" />
                    <span>Morning</span>
                  </label>
                  {extractedData.morning && (
                    <input
                      type="time"
                      value={extractedData.morning_time || '08:30'}
                      onChange={e => setExtractedData({ ...extractedData, morning_time: e.target.value })}
                      style={{ padding: '4px 8px', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '13px', background: 'var(--bg-card)', color: 'var(--text-main)' }}
                    />
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px', borderRadius: '10px', background: 'var(--bg-subtle)' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '14px', flex: '1' }}>
                    <input
                      type="checkbox"
                      checked={Boolean(extractedData.afternoon)}
                      onChange={e => setExtractedData({ ...extractedData, afternoon: e.target.checked })}
                    />
                    <Sun size={18} color="#eab308" />
                    <span>Afternoon</span>
                  </label>
                  {extractedData.afternoon && (
                    <input
                      type="time"
                      value={extractedData.afternoon_time || '13:00'}
                      onChange={e => setExtractedData({ ...extractedData, afternoon_time: e.target.value })}
                      style={{ padding: '4px 8px', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '13px', background: 'var(--bg-card)', color: 'var(--text-main)' }}
                    />
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px', borderRadius: '10px', background: 'var(--bg-subtle)' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '14px', flex: '1' }}>
                    <input
                      type="checkbox"
                      checked={Boolean(extractedData.night)}
                      onChange={e => setExtractedData({ ...extractedData, night: e.target.checked })}
                    />
                    <Moon size={18} color="#6366f1" />
                    <span>Night</span>
                  </label>
                  {extractedData.night && (
                    <input
                      type="time"
                      value={extractedData.night_time || '21:30'}
                      onChange={e => setExtractedData({ ...extractedData, night_time: e.target.value })}
                      style={{ padding: '4px 8px', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '13px', background: 'var(--bg-card)', color: 'var(--text-main)' }}
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Doctor Instructions & Notes */}
            <div className="input-group" style={{ marginTop: '16px' }}>
              <label className="input-label">Doctor Instructions / Notes</label>
              <textarea
                className="input-field"
                rows="2"
                value={doctorInstructions}
                onChange={e => setDoctorInstructions(e.target.value)}
                placeholder="e.g. Take after meal with warm water."
              />
            </div>

            {/* ── AI Summary Card (Collapsible) ── */}
            {aiSummary && (
              <div style={{
                marginTop: '20px',
                borderRadius: '14px',
                border: '1px solid var(--border-color)',
                overflow: 'hidden',
                background: 'var(--bg-subtle)'
              }}>
                <button
                  type="button"
                  onClick={() => setShowSummary(!showSummary)}
                  style={{
                    width: '100%', padding: '14px 18px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: '14px', fontWeight: '700', color: 'var(--primary-color)'
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Sparkles size={18} />
                    AI Summary
                  </span>
                  {showSummary ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
                {showSummary && (
                  <div style={{
                    padding: '0 18px 16px',
                    fontSize: '13px',
                    lineHeight: '1.6',
                    color: 'var(--text-secondary)',
                    whiteSpace: 'pre-line'
                  }}>
                    {aiSummary}
                  </div>
                )}
              </div>
            )}

            <button type="submit" className="btn btn-primary" style={{ marginTop: '16px', padding: '14px' }}>
              <CheckCircle2 size={20} />
              <span>Confirm & Generate Schedule</span>
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── Confirm Lab Report Form Screen ──
  if (extractedLabValues && activeTab === 'report') {
    return (
      <div className="page-container" style={{ maxWidth: '640px' }}>
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '26px', fontWeight: '800', margin: 0, color: 'var(--text-main)' }}>Confirm Lab Results</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: '4px 0 0' }}>Review blood metrics before saving to health record</p>
        </div>

        <div className="card">
          <form onSubmit={handleConfirmLabReport}>
            {extractedLabValues.map((lv, index) => {
              const statusClass = lv.status === 'high' ? 'badge-red' : lv.status === 'low' ? 'badge-amber' : 'badge-green';
              return (
                <div key={index} style={{ marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid var(--border-color)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <input
                      type="text"
                      className="input-field"
                      style={{ fontWeight: '700', width: '60%' }}
                      value={lv.test_name}
                      onChange={e => {
                        const updated = [...extractedLabValues];
                        updated[index].test_name = e.target.value;
                        setExtractedLabValues(updated);
                      }}
                    />
                    <span className={`badge ${statusClass}`}>
                      {lv.status}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <input
                      type="number"
                      step="any"
                      className="input-field"
                      style={{ width: '60%' }}
                      value={lv.value}
                      onChange={e => {
                        const updated = [...extractedLabValues];
                        updated[index].value = e.target.value;
                        setExtractedLabValues(updated);
                      }}
                    />
                    <input
                      type="text"
                      className="input-field"
                      style={{ width: '38%' }}
                      placeholder="Unit"
                      value={lv.unit || ''}
                      onChange={e => {
                        const updated = [...extractedLabValues];
                        updated[index].unit = e.target.value;
                        setExtractedLabValues(updated);
                      }}
                    />
                  </div>
                </div>
              );
            })}
            <button type="submit" className="btn btn-primary" style={{ marginTop: '12px', padding: '14px' }}>
              <CheckCircle2 size={20} />
              <span>Save Lab Report & Correlate</span>
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── Default Upload Landing Screen ──
  return (
    <div className="page-container" style={{ maxWidth: '640px' }}>
      {/* Segmented Control Toggle */}
      <div style={{
        display: 'flex',
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: '16px',
        padding: '4px',
        marginBottom: '32px'
      }}>
        <button
          type="button"
          onClick={() => { setActiveTab('prescription'); clearSelectedFile(); }}
          style={{
            flex: 1,
            padding: '12px',
            borderRadius: '12px',
            border: 'none',
            background: activeTab === 'prescription' ? 'var(--primary-gradient)' : 'transparent',
            color: activeTab === 'prescription' ? '#ffffff' : 'var(--text-secondary)',
            fontWeight: '700',
            fontSize: '14px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px'
          }}
        >
          <Pill size={18} />
          <span>Prescription Intelligence</span>
        </button>
        <button
          type="button"
          onClick={() => { setActiveTab('report'); clearSelectedFile(); }}
          style={{
            flex: 1,
            padding: '12px',
            borderRadius: '12px',
            border: 'none',
            background: activeTab === 'report' ? 'var(--primary-gradient)' : 'transparent',
            color: activeTab === 'report' ? '#ffffff' : 'var(--text-secondary)',
            fontWeight: '700',
            fontSize: '14px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px'
          }}
        >
          <FileText size={18} />
          <span>Lab Report Analysis</span>
        </button>
      </div>

      <div style={{ textAlign: 'center', marginBottom: '32px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: '800', color: 'var(--text-main)', margin: 0 }}>
          {activeTab === 'prescription' ? 'AI Document Upload' : 'Upload Blood Test Report'}
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '15px', marginTop: '6px' }}>
          {activeTab === 'prescription'
            ? 'Upload any medical document — prescriptions, reports, scans — and AI will classify & extract data automatically.'
            : 'Upload a lab test document to flag out-of-range health metrics.'}
        </p>
      </div>

      {/* Actual Error Alert Display (Requirements 7) */}
      {errorMessage && (
        <div style={{
          background: '#fef2f2',
          color: '#991b1b',
          border: '1px solid #fecaca',
          padding: '14px 18px',
          borderRadius: '14px',
          marginBottom: '24px',
          fontSize: '14px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <AlertTriangle size={20} color="#dc2626" />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: '700' }}>Upload Error</div>
            <div>{errorMessage}</div>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage('')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b', padding: '4px' }}
          >
            <X size={18} />
          </button>
        </div>
      )}

      {/* Single Hidden File Input connected to both buttons (Requirement 10) */}
      <input
        type="file"
        accept="image/*,application/pdf"
        ref={fileInputRef}
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      <div className="card" style={{ textAlign: 'center', padding: '36px 24px' }}>
        {/* Selected file preview box before upload if any */}
        {file && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', borderRadius: '12px', background: 'var(--bg-subtle)',
            border: '1px solid var(--border-color)', marginBottom: '24px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {previewUrl ? (
                <img src={previewUrl} alt="Preview" style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '8px' }} />
              ) : (
                <FileCode size={36} color="var(--primary-color)" />
              )}
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-main)' }}>{file.name}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {(file.size / (1024 * 1024)).toFixed(2)} MB • {file.type || 'Document'}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={clearSelectedFile}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
            >
              <X size={20} />
            </button>
          </div>
        )}

        {/* Supported document types info */}
        {activeTab === 'prescription' && (
          <div style={{
            display: 'flex', flexWrap: 'wrap', justifyContent: 'center',
            gap: '6px', marginBottom: '24px'
          }}>
            {['Prescription', 'Blood Test', 'X-Ray', 'MRI', 'CT Scan', 'ECG', 'Ultrasound', 'Discharge Summary', 'Vaccination'].map(type => (
              <span key={type} className="badge badge-blue" style={{ fontSize: '11px', padding: '3px 8px', opacity: 0.8 }}>
                {type}
              </span>
            ))}
          </div>
        )}

        {/* Button 1: Camera / Upload */}
        <button
          type="button"
          className="btn btn-primary"
          style={{ padding: '18px 24px', fontSize: '16px', marginBottom: '16px', width: '100%' }}
          onClick={() => {
            if (fileInputRef.current) {
              fileInputRef.current.setAttribute('capture', 'environment');
              fileInputRef.current.click();
            }
          }}
        >
          <Camera size={24} />
          <span>Take Photo or Upload Image/PDF</span>
        </button>

        {/* Button 2: Browse Files */}
        <button
          type="button"
          className="btn btn-outline"
          style={{ padding: '18px 24px', fontSize: '16px', width: '100%' }}
          onClick={() => {
            if (fileInputRef.current) {
              fileInputRef.current.removeAttribute('capture');
              fileInputRef.current.click();
            }
          }}
        >
          <Upload size={24} />
          <span>Browse Document Files</span>
        </button>
      </div>
    </div>
  );
}
