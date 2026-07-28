import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { ComplaintFormPanel } from './components/ComplaintFormPanel';
import { CopilotChatPanel } from './components/CopilotChatPanel';
import { DiffComparisonModal } from './components/DiffComparisonModal';
import { DatabaseInspectorModal } from './components/DatabaseInspectorModal';
import { ComplaintsDirectoryModal } from './components/ComplaintsDirectoryModal';
import { ArchitectureModal } from './components/ArchitectureModal';
import { ReportModal } from './components/ReportModal';
import { ComplaintData, ChatMessage, FieldDiff, RiskAssessment, UserProfile } from './types/complaint';

const DEFAULT_USER: UserProfile = {
  id: 'usr-1',
  name: 'Sarah Jenkins',
  email: 's.jenkins@pharmaco.com',
  role: 'Quality Manager',
  avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150',
};

const INITIAL_FORM: ComplaintData = {
  id: 'cmp-001',
  complaintId: 'CMP-2026-0891',
  customerName: 'Apollo Pharmacy',
  complaintDate: new Date().toISOString().split('T')[0],
  productName: 'Amoxicillin Capsules',
  dosageForm: 'Capsules',
  strength: '500 mg',
  packSize: '10x10 Blister Pack',
  batchNumber: 'BMX24601',
  lotNumber: 'LOT-9012',
  mfgDate: '2025-11-10',
  expiryDate: '2027-11-09',
  defectCategory: 'Physical Defect',
  defectDescription: 'Discolored yellowish spots observed inside transparent capsule shells during receipt inspection at retail branch.',
  complaintCategory: 'Quality Defect',
  quantity: 120,
  unit: 'Capsules',
  packaging: 'Blister Pack',
  country: 'United States',
  plant: 'Plant 1 - Main Facility',
  mfgSite: 'Hyderabad Site Alpha',
  supplier: 'CapsuGel Worldwide Ltd.',
  customerRemarks: 'Stock quarantined on arrival. Customer requested immediate batch investigation and credit replacement.',
  attachments: [
    {
      id: 'att-1',
      name: 'Apollo_Inspection_Report.pdf',
      size: '1.2 MB',
      type: 'application/pdf',
    },
  ],
  priority: 'High',
  status: 'Under Investigation',
};

const INITIAL_RISK: RiskAssessment = {
  severity: 'Major',
  riskLevel: 'High',
  impact: 'Discoloration indicates potential moisture degradation or capsule shell reaction.',
  patientRisk: 'Moderate patient exposure risk if potency is diminished or degradation products formed.',
  businessRisk: 'Brand impact with Apollo Pharmacy key retail partner; potential batch quarantine.',
  complianceRisk: 'Requires 15-day FDA Field Alert Report assessment under 21 CFR 211.198.',
  qualityRisk: 'Blister seal integrity failure during bulk packaging line operations.',
  rootCauseHypothesis: 'Micro-pinholes in foil blister web during sealing station thermal cycle.',
  confidenceScore: 92,
  recommendedNextAction: 'Quarantine distribution stock of BMX24601 and test retain samples.',
  escalation: true,
  escalationDetails: 'Escalated to Site Quality Head and Packaging Line Manager.',
  capaRecommendation: 'Inspect packaging line 4 heat seal temperature sensors and foil feeder.',
  replacementRecommendation: 'Issue immediate replacement credit note for 120 capsules.',
  recallRecommendation: 'Batch recall not required yet; pending retain sample assay testing.',
  qaInvestigation: 'Perform HPLC chemical assay and moisture content test on retain samples.',
  regulatoryReportingRecommendation: 'Submit 15-Day FAR report if moisture degradation confirmed.',
  reasoningSummary: 'Discoloration on oral solids suggests environmental moisture ingress. Severity rated Major due to commercial distribution state.',
};

export default function App() {
  const [formData, setFormData] = useState<ComplaintData>(INITIAL_FORM);
  const [activeRisk, setActiveRisk] = useState<RiskAssessment>(INITIAL_RISK);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [diffs, setDiffs] = useState<FieldDiff[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaved, setIsSaved] = useState<boolean>(false);

  // Modals state
  const [isDiffModalOpen, setIsDiffModalOpen] = useState(false);
  const [isDbInspectorOpen, setIsDbInspectorOpen] = useState(false);
  const [isDirectoryOpen, setIsDirectoryOpen] = useState(false);
  const [isArchitectureOpen, setIsArchitectureOpen] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);

  // Load initial welcome message
  useEffect(() => {
    setMessages([
      {
        id: 'welcome-1',
        sender: 'assistant',
        text: 'Hello! I am your AI Complaint Copilot. I have automatically extracted the initial complaint details for Apollo Pharmacy (Amoxicillin 500 mg). How would you like to update or process this complaint?',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        riskAssessment: INITIAL_RISK,
      },
    ]);
  }, []);

  // Handle Natural Language Message Send
  const handleSendMessage = async (userText: string) => {
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Add user message to state
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: 'user',
      text: userText,
      timestamp,
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setIsLoading(true);
    setIsSaved(false);

    try {
      const response = await fetch('/api/copilot/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userText,
          currentFormState: formData,
          conversationHistory: newMessages.map((m) => ({ sender: m.sender, text: m.text })),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to process copilot request.');
      }

      // Update form data with extracted output
      const updatedForm: ComplaintData = {
        ...formData,
        ...(data.extractedJSON || {}),
      };
      setFormData(updatedForm);

      if (data.riskAssessment) {
        setActiveRisk(data.riskAssessment);
      }

      if (data.diffs && data.diffs.length > 0) {
        setDiffs(data.diffs);
      }

      let responseText = data.replyText || 'Updated complaint form details and refreshed AI risk assessment.';
      if (data.duplicateWarning?.isDuplicate) {
        responseText += `\n\n⚠️ DUPLICATE DETECTED: ${data.duplicateWarning.similarityReason}`;
      }

      // Add assistant response
      const assistantMsg: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        sender: 'assistant',
        text: responseText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        extractedJSON: data.extractedJSON,
        riskAssessment: data.riskAssessment,
        diffs: data.diffs,
        missingFields: data.missingFields,
        duplicateWarning: data.duplicateWarning,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (error: any) {
      console.error('Copilot send message error:', error);
      setMessages((prev) => [
        ...prev,
        {
          id: `msg-err-${Date.now()}`,
          sender: 'assistant',
          text: `Error processing request: ${error.message || 'Server error'}. Please try again.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Document Upload OCR
  const handleFileUpload = async (file: File) => {
    setIsLoading(true);
    setIsSaved(false);

    const bodyFormData = new FormData();
    bodyFormData.append('file', file);
    bodyFormData.append('currentFormState', JSON.stringify(formData));

    try {
      const response = await fetch('/api/copilot/extract-document', {
        method: 'POST',
        body: bodyFormData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to extract document data.');
      }

      const updatedForm: ComplaintData = {
        ...formData,
        ...(data.extractedJSON || {}),
      };
      setFormData(updatedForm);

      if (data.riskAssessment) {
        setActiveRisk(data.riskAssessment);
      }

      const assistantMsg: ChatMessage = {
        id: `msg-doc-${Date.now()}`,
        sender: 'assistant',
        text: `Extracted data from document "${file.name}". The complaint form has been auto-populated with the extracted entities and fresh risk scoring.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        extractedJSON: data.extractedJSON,
        riskAssessment: data.riskAssessment,
        diffs: data.diffs,
        isDocumentExtract: true,
        fileName: file.name,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (error: any) {
      console.error('File extraction error:', error);
      alert(`File extraction failed: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Save / Finalize Complaint
  const handleSaveComplaint = async () => {
    try {
      const response = await fetch('/api/complaints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          complaintData: formData,
          modifiedBy: DEFAULT_USER.name,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        setIsSaved(true);
        setFormData(data.complaint);
      }
    } catch (err) {
      console.error('Failed to save complaint:', err);
    }
  };

  // Select Complaint from Directory
  const handleSelectComplaint = (selected: ComplaintData) => {
    setFormData(selected);
    setIsSaved(true);
    setDiffs([]);
    setMessages([
      {
        id: `msg-load-${Date.now()}`,
        sender: 'assistant',
        text: `Loaded complaint record ${selected.complaintId} (${selected.customerName} - ${selected.productName}). Ask any edit request or risk questions in chat.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  };

  // Reset Dataset to initial seed
  const handleResetData = async () => {
    if (confirm('Are you sure you want to reset the database to initial seed complaints?')) {
      await fetch('/api/db/reset', { method: 'POST' });
      setFormData(INITIAL_FORM);
      setActiveRisk(INITIAL_RISK);
      setDiffs([]);
      setIsSaved(false);
      setMessages([
        {
          id: 'welcome-reset',
          sender: 'assistant',
          text: 'Database reset to default seed state. Initial complaint loaded for Apollo Pharmacy.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          riskAssessment: INITIAL_RISK,
        },
      ]);
    }
  };

  return (
    <div className="h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white overflow-hidden">
      {/* Top Header */}
      <Header
        user={DEFAULT_USER}
        onOpenDirectory={() => setIsDirectoryOpen(true)}
        onOpenDbInspector={() => setIsDbInspectorOpen(true)}
        onOpenArchitecture={() => setIsArchitectureOpen(true)}
        onResetData={handleResetData}
        activeComplaintId={formData.complaintId}
      />

      {/* Main Two-Panel Layout */}
      <main className="flex-1 w-full p-2 sm:p-3 grid grid-cols-1 lg:grid-cols-12 gap-3 overflow-hidden min-h-0">
        {/* LEFT PANEL: Log Customer Complaint Form (Auto Populated / Read Only) */}
        <section className="lg:col-span-7 h-full flex flex-col overflow-hidden min-h-0">
          <ComplaintFormPanel
            formData={formData}
            diffs={diffs}
            onOpenDiffModal={() => setIsDiffModalOpen(true)}
            onSaveComplaint={handleSaveComplaint}
            onGenerateReport={() => setIsReportOpen(true)}
            isSaved={isSaved}
          />
        </section>

        {/* RIGHT PANEL: AI Copilot Chat Assistant */}
        <section className="lg:col-span-5 h-full flex flex-col overflow-hidden min-h-0">
          <CopilotChatPanel
            messages={messages}
            onSendMessage={handleSendMessage}
            onFileUpload={handleFileUpload}
            isLoading={isLoading}
            currentFormState={formData}
            onOpenDiffModal={() => setIsDiffModalOpen(true)}
          />
        </section>
      </main>

      {/* Technical Status Footer */}
      <footer className="h-6 bg-slate-900 border-t border-slate-800 px-4 flex items-center justify-between text-[10px] font-mono text-slate-500 shrink-0 select-none">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className="text-slate-400">SESSION:</span> 9XF-7721
          </span>
          <span className="hidden sm:inline">
            <span className="text-slate-400">LLM ENGINE:</span> GEMINI-3.6-FLASH
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden md:inline text-slate-400">ENCRYPTED END-TO-END</span>
          <span className="text-blue-400">DB_SYNC: 24ms</span>
        </div>
      </footer>

      {/* Modals & Overlays */}
      <DiffComparisonModal
        isOpen={isDiffModalOpen}
        onClose={() => setIsDiffModalOpen(false)}
        diffs={diffs}
        complaintId={formData.complaintId}
      />

      <DatabaseInspectorModal
        isOpen={isDbInspectorOpen}
        onClose={() => setIsDbInspectorOpen(false)}
      />

      <ComplaintsDirectoryModal
        isOpen={isDirectoryOpen}
        onClose={() => setIsDirectoryOpen(false)}
        onSelectComplaint={handleSelectComplaint}
        activeId={formData.id}
      />

      <ArchitectureModal
        isOpen={isArchitectureOpen}
        onClose={() => setIsArchitectureOpen(false)}
      />

      <ReportModal
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        complaint={formData}
        risk={activeRisk}
      />
    </div>
  );
}
