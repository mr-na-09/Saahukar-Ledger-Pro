import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Home, LockKeyhole } from 'lucide-react';
import { calculateLiveInterest, processPartPayment } from './utils/interestEngine';
import { generatePDFReceipt } from './utils/pdfGenerator';
import { securePin } from './services/security';
import { canAddCustomer, consumeWhatsAppReminder, createFreeEntitlement, FREE_CUSTOMER_LIMIT, getCurrentPlan, getSubscriptionStatus, hasFeature, isPro, PLAN_PRICING } from './services/entitlements';
import CustomerDirectory from './components/CustomerDirectory';
import AuthPinModal from './components/AuthPinModal';
import CustomerProfile from './components/CustomerProfile';
import PrivateLedger from './components/PrivateLedger';
import Reports from './components/Reports';
import { storageService, storagePlatform } from './services/storage/storageService';
import { createLocalAccount, getActiveLocalSession, setActiveLocalUser, signInLocalAccount, signOutLocalAccount, updateLocalProfile } from './services/localAccounts';
import { parseBackup, serializeCsvBackup, serializeJsonBackup } from './utils/backup';

const WINDOWS_DOWNLOAD_URL = 'https://drive.google.com/uc?export=download&id=1YQvRZlr-Lu5HQulD1YSueGsMLOVSqP9S';
const ANDROID_DOWNLOAD_URL = 'https://drive.google.com/uc?export=download&id=15L06TBi1H69MFyW11P2CCVXdHwRwpJBt';

const triggerDirectDownload = (url) => {
  const link = document.createElement('a');
  link.href = url;
  link.rel = 'noopener noreferrer';
  link.target = '_blank';
  link.download = '';
  document.body.appendChild(link);
  link.click();
  link.remove();
};

function SuccessVisual({ message }) {
  return (
    <div className="success-visual" role="status">
      <div className="success-visual__scene" aria-hidden="true">
        <div className="success-visual__halo"></div>
        <div className="success-visual__coin">&#10003;</div>
        <div className="success-visual__shadow"></div>
      </div>
      <div>
        <p className="success-visual__label">Complete / verified</p>
        <p className="success-visual__message">{message}</p>
      </div>
    </div>
  );
}

function CreatorCredit() {
  return <button type="button" className="creator-credit" aria-label="Made by Nitiksh Awasthi">Made by <strong>Nitiksh Awasthi</strong></button>;
}

function createPaymentId() {
  return Date.now() + Math.floor(Math.random() * 1000);
}

function getSessionProfile(session) {
  return {
    ...(session?.user?.user_metadata || {}),
    email: session?.user?.email || '',
    phone_number: session?.user?.user_metadata?.phone_number || session?.user?.phone || ''
  };
}

function getInitialLocalState() {
  try {
    return { session: getActiveLocalSession(), actionMessage: { type: '', text: '' } };
  } catch (error) {
    return {
      session: null,
      actionMessage: { type: 'error', text: error.message || 'Local account data could not be read. Import a backup to restore access.' }
    };
  }
}

const welcomeCopy = {
  EN: {
    greeting: 'A warm welcome',
    intro: 'A clearer way to manage your lending ledger.',
    description: 'Keep customer accounts, loan balances, interest and collections organized in one private workspace.',
    language: 'Language',
    login: 'Log in',
    signup: 'Sign up',
    accountTitle: 'Create your account',
    signupSteps: [
      'Choose Sign up and enter your name, mobile number, email and password.',
      'Your account and ledger are stored in this browser only; they do not sync across devices.',
      'Sign in here. The default security PIN is 1234; change it under Tools after logging in.'
    ],
    emailNote: 'Download JSON or CSV backups regularly. After browser data is cleared, create your local account again, sign in, and import the backup from Tools.',
    reset: 'Local passwords cannot be reset by email. Keep your password and an external backup safe.',
    guideTitle: 'Using the ledger',
    guide: [
      ['Home / Dashboard', 'See active accounts, principal, interest and collections.'],
      ['Add Customer', 'Save customer details, loan amount, rate, interest type and loan date.'],
      ['Customer Directory', 'Search customers, open history, add a later loan or prepare a WhatsApp message.'],
      ['Part Payment', 'Load a customer by ID. A payment is applied to interest first, then principal.'],
      ['Private Ledger / Reports', 'Review payment entries, collections and business summaries.'],
      ['Backup & Tools', 'Use available backup and security actions. Device storage depends on free space.']
    ],
    whatsapp: 'WhatsApp opens a prepared message; tap Send in WhatsApp to send it.',
    support: 'Need a hand? Contact support',
    owner: 'Nitiksh Awasthi',
    address: 'Harihar Nagar, Dharni, Maharashtra',
    call: 'Call',
    wa: 'WhatsApp support'
  },
  HI: {
    greeting: 'आपका हार्दिक स्वागत है',
    intro: 'अपने लेजर और उधार का हिसाब आसानी से रखें।',
    description: 'ग्राहक, कर्ज़ की बाकी रकम, ब्याज और वसूली का हिसाब एक निजी जगह पर व्यवस्थित करें।',
    language: 'भाषा',
    login: 'लॉग इन',
    signup: 'साइन अप',
    accountTitle: 'अपना अकाउंट बनाएं',
    signupSteps: [
      'Sign up चुनें और नाम, मोबाइल, ईमेल और पासवर्ड भरें।',
      'आपका अकाउंट और लेजर केवल इसी ब्राउज़र में सेव होगा; दूसरे डिवाइस से sync नहीं होगा।',
      'यहाँ लॉग इन करें। डिफ़ॉल्ट PIN 1234 है; लॉग इन के बाद Tools में बदलें।'
    ],
    emailNote: 'नियमित रूप से JSON या CSV बैकअप डाउनलोड करें। ब्राउज़र डेटा मिटने के बाद अकाउंट फिर बनाकर लॉग इन करें और Tools से बैकअप import करें।',
    reset: 'लोकल पासवर्ड ईमेल से reset नहीं हो सकता। पासवर्ड और बाहरी बैकअप सुरक्षित रखें।',
    guideTitle: 'लेजर का इस्तेमाल',
    guide: [
      ['Home / Dashboard', 'चालू खाते, मूलधन, ब्याज और वसूली का सार देखें।'],
      ['Add Customer', 'ग्राहक की जानकारी, कर्ज़, दर, ब्याज का प्रकार और तारीख सेव करें।'],
      ['Customer Directory', 'ग्राहक खोजें, पुराना हिसाब देखें, आगे और रकम दें या WhatsApp संदेश तैयार करें।'],
      ['Part Payment', 'ग्राहक ID डालकर भुगतान दर्ज करें। भुगतान पहले ब्याज, फिर मूलधन में घटता है।'],
      ['Private Ledger / Reports', 'भुगतान की एंट्री, वसूली और कारोबार की रिपोर्ट देखें।'],
      ['Backup & Tools', 'बैकअप और सुरक्षा के विकल्प इस्तेमाल करें। जगह आपके डिवाइस की खाली जगह पर निर्भर है।']
    ],
    whatsapp: 'WhatsApp में संदेश पहले से तैयार खुलेगा; भेजने के लिए Send दबाएं।',
    support: 'मदद चाहिए? सहायता के लिए संपर्क करें',
    owner: 'Nitiksh Awasthi',
    address: 'Harihar Nagar, Dharni, Maharashtra',
    call: 'कॉल करें',
    wa: 'WhatsApp सहायता'
  },
  HINGLISH: {
    greeting: 'Aapka dil se swagat hai',
    intro: 'Apne lending ledger ko rakhein clear aur organized.',
    description: 'Customer accounts, loan balance, interest aur collections ko ek private workspace mein manage karein.',
    language: 'Language',
    login: 'Log in',
    signup: 'Sign up',
    accountTitle: 'Account kaise banayein',
    signupSteps: [
      'Sign up chunein aur naam, mobile, email aur password enter karein.',
      'Account aur ledger sirf isi browser mein save honge; dusre device par sync nahi honge.',
      'Yahin sign in karein. Default security PIN 1234 hai; login ke baad Tools mein badlein.'
    ],
    emailNote: 'Regular JSON ya CSV backup download karein. Browser data clear ho to local account dobara bana kar sign in karein, phir Tools se backup import karein.',
    reset: 'Local password email se reset nahi ho sakta. Password aur external backup sambhal kar rakhein.',
    guideTitle: 'App kaise use karein',
    guide: [
      ['Home / Dashboard', 'Active accounts, principal, interest aur collections ka summary dekhein.'],
      ['Add Customer', 'Customer details, loan amount, rate, interest type aur date save karein.'],
      ['Customer Directory', 'Customer search/profile, payment history, additional loan aur WhatsApp actions.'],
      ['Part Payment', 'Customer ID load karke payment karein; pehle interest aur phir principal adjust hota hai.'],
      ['Private Ledger / Reports', 'Payment entries, collections aur business summary dekhein.'],
      ['Backup & Tools', 'Backup aur security options use karein. Storage device ki free space par depend hai.']
    ],
    whatsapp: 'WhatsApp message draft kholega; bhejne ke liye WhatsApp mein Send dabayein.',
    support: 'Koi doubt? Support se contact karein',
    owner: 'Nitiksh Awasthi',
    address: 'Harihar Nagar, Dharni, Maharashtra',
    call: 'Call',
    wa: 'WhatsApp support'
  }
};

function WelcomeGuide({ onLogin, onSignup, language, onLanguage }) {
  const copy = welcomeCopy[language] || welcomeCopy.HINGLISH;
  return (
    <div className="auth-scene min-h-screen p-4 sm:p-8">
      <CreatorCredit />
      <main className="welcome-page auth-card mx-auto w-full max-w-6xl overflow-hidden rounded-2xl border">
        <section className="welcome-hero p-5 sm:p-8">
          <header className="flex flex-wrap items-center justify-between gap-5">
            <div className="flex items-center gap-4">
              <div className="brand-mark" aria-hidden="true"><span></span><span></span><span></span></div>
              <div><p className="eyebrow">Private ledger suite</p><h1 className="text-2xl font-bold text-white">Sahukar Ledger Pro</h1></div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-sm font-semibold text-white" htmlFor="welcome-language">{copy.language}</label>
              <select id="welcome-language" value={language} onChange={event => onLanguage(event.target.value)} className="rounded-lg border border-white/40 bg-white/10 px-3 py-2 text-sm font-bold text-white [&>option]:text-slate-900">
                <option value="HINGLISH">Hinglish</option><option value="HI">हिन्दी</option><option value="EN">English</option>
              </select>
              <button type="button" onClick={onLogin} className="rounded-lg bg-white px-4 py-2.5 font-bold text-slate-900 transition hover:bg-slate-100">{copy.login}</button>
              <button type="button" onClick={onSignup} className="rounded-lg bg-emerald-500 px-4 py-2.5 font-bold text-white transition hover:bg-emerald-600">{copy.signup}</button>
            </div>
          </header>
          <div className="welcome-hero-copy">
            <p className="eyebrow">{copy.greeting}, Nitiksh</p>
            <h2>{copy.intro}</h2>
            <p>{copy.description}</p>
          </div>
        </section>

        <div className="grid gap-8 p-5 sm:p-8 lg:grid-cols-2">
          <section>
            <h3 className="mb-4 text-lg font-bold text-slate-800">{copy.accountTitle}</h3>
            <ol className="space-y-3">{copy.signupSteps.map((step, index) => <li key={step} className="flex gap-3 text-sm leading-6 text-slate-600"><span className="welcome-step">{index + 1}</span><span>{step}</span></li>)}</ol>
            <p className="mt-4 border-l-2 border-amber-500 pl-3 text-sm leading-6 text-slate-600">{copy.emailNote}</p>
            <p className="mt-3 text-sm leading-6 text-slate-500">{copy.reset}</p>
          </section>
          <section>
            <h3 className="mb-4 text-lg font-bold text-slate-800">{copy.guideTitle}</h3>
            <ul className="space-y-3">{copy.guide.map(([title, detail]) => <li key={title} className="text-sm leading-6 text-slate-600"><strong className="text-slate-800">{title}:</strong> {detail}</li>)}</ul>
            <p className="mt-4 text-sm leading-6 text-slate-500">{copy.whatsapp}</p>
          </section>
        </div>

        <footer className="welcome-footer flex flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <div><p className="font-bold text-slate-800">{copy.support}</p><p className="text-sm text-slate-600">{copy.owner} · {copy.address}</p></div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-bold">
            <a className="text-blue-700 hover:underline" href="https://instagram.com/mr_na_09" target="_blank" rel="noreferrer">Instagram: @mr_na_09</a>
            <a className="text-blue-700 hover:underline" href="tel:+919404111123">{copy.call}: 9404111123</a>
            <a className="text-emerald-700 hover:underline" href="https://wa.me/919404111123" target="_blank" rel="noreferrer">{copy.wa}</a>
            <a className="text-blue-700 hover:underline" href="mailto:awasthinitiksh09@gmail.com">awasthinitiksh09@gmail.com</a>
          </div>
        </footer>
      </main>
    </div>
  );
}

export default function App() {
  // Auth & Session States
  const [initialLocalState] = useState(getInitialLocalState);
  const [session, setSession] = useState(initialLocalState.session);
  const restoredUser = initialLocalState.session?.user;
  const [authMode, setAuthMode] = useState('LOGIN'); // 'LOGIN' or 'SIGNUP'
  const [showWelcome, setShowWelcome] = useState(true);
  const [loading, setLoading] = useState(Boolean(initialLocalState.session));
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError] = useState('');
  const [actionMessage, setActionMessage] = useState(initialLocalState.actionMessage);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [pinLocked, setPinLocked] = useState(false);

  // Sign In / Sign Up Form States
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [businessName, setBusinessName] = useState('');

  // UI Tabs & Language State
  const [activeTab, setActiveTab] = useState('dash'); // 'dash', 'add', 'dir', 'pay', 'ledger', 'reports', 'tools'
  const [lang, setLang] = useState(() => localStorage.getItem('sahukar-language') || 'HINGLISH');

  // Application Data States
  const [customers, setCustomers] = useState([]);
  const [payments, setPayments] = useState([]);

  // Add Customer Form States
  const [custForm, setCustForm] = useState({
    name: '', mobile: '', address: '', gov_id: '',
    principal: '', interest_rate: '', loan_date: new Date().toISOString().split('T')[0],
    collateral: '', gold_weight: '', notes: '', interest_type: 'SIMPLE'
  });

  // Payment Form States
  const [payCustId, setPayCustId] = useState('');
  const [selectedCust, setSelectedCust] = useState(null);
  const [payAmount, setPayAmount] = useState('');
  const [profileCustomer, setProfileCustomer] = useState(null);
  const [pinValue, setPinValue] = useState('');
  const [pinSetupRequired, setPinSetupRequired] = useState(false);
  const [pinSetupDraft, setPinSetupDraft] = useState('');
  const [pinSetupConfirm, setPinSetupConfirm] = useState('');
  const [pinSetupBusy, setPinSetupBusy] = useState(false);
  const backupFileInputRef = useRef(null);
  const activeStorageUserId = useRef(null);
  const pinInitializationGeneration = useRef(0);
  const pinSetupCompletedForUser = useRef(null);
  const entitlement = createFreeEntitlement(session?.user?.id ? 'local' : 'signed-out');

  const initializePin = async (user) => {
    if (pinSetupCompletedForUser.current === user.id) return;
    const generation = ++pinInitializationGeneration.current;
    let localPin = await securePin.get(user.id);
    if (generation !== pinInitializationGeneration.current || pinSetupCompletedForUser.current === user.id) return;
    if (!localPin) {
      await securePin.store(user.id, '1234');
      localPin = await securePin.get(user.id);
    }
    if (generation !== pinInitializationGeneration.current || pinSetupCompletedForUser.current === user.id) return;
    setPinSetupRequired(!localPin);
    setPinValue('');
    setPinLocked(true);
  };

  const loadData = async (userId) => {
    setDataLoading(true);

    try {
      await storageService.ensureUserStorage(userId);
      const localData = await storageService.readLedger(userId);
      setCustomers(localData.customers);
      setPayments(localData.payments);
      setActionMessage({ type: '', text: '' });
    } catch (error) {
      console.error('Failed to load local ledger data:', error);
      setActionMessage({ type: 'error', text: error.message || 'Local ledger could not be opened. Your data was not changed.' });
    } finally {
      setDataLoading(false);
    }
  };

  const saveData = async (userId, nextCustomers, nextPayments) => {
    if (session?.user?.id !== userId) throw new Error('The active account changed; refusing to write ledger data.');
    const persisted = await storageService.writeLedger(userId, { customers: nextCustomers, payments: nextPayments });
    setCustomers(persisted.customers);
    setPayments(persisted.payments);
  };

  useEffect(() => {
    localStorage.setItem('sahukar-language', lang);
  }, [lang]);

  useEffect(() => {
    const user = restoredUser;
    if (!user?.id) return undefined;
    let active = true;
    const timer = window.setTimeout(() => {
      activeStorageUserId.current = user.id;
      initializePin(user).catch(error => {
        if (!active) return;
        console.error('Could not initialize local PIN:', error);
        setPinSetupRequired(true);
        setPinLocked(true);
      }).finally(() => {
        if (active) setLoading(false);
      });
      void loadData(user.id);
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [restoredUser]);

  // Local account authentication and persistence.
  const handleAuth = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (authBusy) return;
    setAuthBusy(true);

    try {
      if (authMode === 'SIGNUP') {
        await createLocalAccount({ fullName, phone, businessName, email, password });
        setSuccessMsg('Local account created. Sign in on this browser to continue.');
        setAuthMode('LOGIN');
      } else {
        const nextSession = await signInLocalAccount(email, password);
        setActiveLocalUser(nextSession.user.id);
        setSession(nextSession);
        activeStorageUserId.current = nextSession.user.id;
        setShowWelcome(false);
        await initializePin(nextSession.user);
        await loadData(nextSession.user.id);
        setPinLocked(true);
      }
    } catch (error) {
      setErrorMsg(error.message || 'Local account could not be saved.');
    } finally {
      setAuthBusy(false);
    }
  };

  // Dynamic Live Interest Calculation Logic
  const calculateInterest = (principal, rate, loanDateStr, interestType = 'SIMPLE', interestCarry = 0, interestPaidSinceDate = 0) => {
    const live = calculateLiveInterest(principal, rate, loanDateStr, [], interestType, interestCarry, interestPaidSinceDate);
    return { days: live.totalDays, interest: live.livePendingInterest, total: live.totalPayableNow };
  };

  // Save Customer Handler
  const handleSaveCustomer = async (e) => {
    e.preventDefault();
    if (!canAddCustomer(customers.length, entitlement)) {
      setActionMessage({ type: 'error', text: `Free plan par ${FREE_CUSTOMER_LIMIT} customers tak add kar sakte hain. Existing customer data safe hai; additional customers ke liye Pro upgrade available hoga.` });
      return;
    }
    if (!custForm.name || !custForm.mobile || !custForm.principal || !custForm.interest_rate) {
      setActionMessage({ type: 'error', text: 'Kripya sabhi aavashyak (*) fields bharein!' });
      return;
    }
    const principal = Number(custForm.principal);
    const interestRate = Number(custForm.interest_rate);
    if (!Number.isFinite(principal) || principal <= 0 || !Number.isFinite(interestRate) || interestRate < 0 || !Number.isFinite(Date.parse(custForm.loan_date))) {
      setActionMessage({ type: 'error', text: 'Principal, interest rate, and loan date must be valid financial values.' });
      return;
    }
    const nextCustomer = {
      id: createPaymentId(),
      name: custForm.name,
      mobile: custForm.mobile,
      address: custForm.address,
      gov_id: custForm.gov_id,
      principal,
      interest_rate: interestRate,
      interest_type: custForm.interest_type,
      loan_date: custForm.loan_date,
      collateral: custForm.collateral,
      gold_weight: Number(custForm.gold_weight || 0),
      notes: custForm.notes
    };
    const nextCustomers = [...customers, nextCustomer];
    try {
      await saveData(session.user.id, nextCustomers, payments);
    } catch (error) {
      setActionMessage({ type: 'error', text: error.message || 'Customer could not be saved locally.' });
      return;
    }
    {
      setActionMessage({ type: 'success', text: 'Naya grahak record safaltapoorvak saheja gaya!' });
      setCustForm({
        name: '', mobile: '', address: '', gov_id: '',
        principal: '', interest_rate: '', loan_date: new Date().toISOString().split('T')[0],
        collateral: '', gold_weight: '', notes: '', interest_type: 'SIMPLE'
      });
      setActiveTab('dir');
    }
  };

  // Payment Processing Logic
  const handleFetchCustomerForPay = () => {
    const found = customers.find(c => c.id === parseInt(payCustId));
    if (found) {
      const calc = calculateInterest(found.principal, found.interest_rate, found.loan_date, found.interest_type, found.interest_carry, found.interest_paid_since_loan_date);
      setSelectedCust({ ...found, ...calc });
      setActionMessage({ type: 'success', text: 'Confirmed — customer details loaded successfully.' });
    } else {
      setActionMessage({ type: 'error', text: 'Grahak nahi mila! Sahi Customer ID dalein.' });
      setSelectedCust(null);
    }
  };

  const handleProcessPayment = async () => {
    const paid = Number(payAmount);
    if (!selectedCust || !Number.isFinite(paid) || paid <= 0) {
      setActionMessage({ type: 'error', text: 'Valid payment amount enter karein.' });
      return;
    }
    if (paid > Number(selectedCust.total) + 0.01) {
      setActionMessage({ type: 'error', text: 'Payment amount cannot exceed the current payable balance.' });
      return;
    }
    let payment;
    try {
      payment = processPartPayment(selectedCust.principal, selectedCust.interest, paid);
    } catch (error) {
      setActionMessage({ type: 'error', text: error.message || 'Payment values are invalid.' });
      return;
    }
    const { interestPaid: intPaid, principalDeducted: princPaid, remainingPrincipal: newPrinc } = payment;
    const paymentNumber = payments.filter(paymentItem => paymentItem.customer_id === selectedCust.id).length + 1;

    const nextCustomers = customers.map(customer => {
      if (customer.id !== selectedCust.id) return customer;
      const interestCarry = Number(customer.interest_carry || 0);
      return {
        ...customer,
        principal: newPrinc,
        updated_at: new Date().toISOString(),
        interest_carry: Math.max(0, interestCarry - intPaid),
        interest_paid_since_loan_date: Number(customer.interest_paid_since_loan_date || 0) + Math.max(0, intPaid - interestCarry)
      };
    });
    const nextPayment = {
      id: createPaymentId(),
      customer_id: Number(selectedCust.id),
      payment_date: new Date().toISOString().split('T')[0],
      total_paid: paid,
      interest_paid: intPaid,
      principal_paid: princPaid,
      remaining_principal: newPrinc
    };
    try {
      await saveData(session.user.id, nextCustomers, [nextPayment, ...payments]);
    } catch (error) {
      setActionMessage({ type: 'error', text: error.message || 'Payment could not be saved locally.' });
      return;
    }

    const receiptAvailable = hasFeature('pdf_receipts', entitlement);
    if (receiptAvailable) {
      generatePDFReceipt(
        selectedCust,
        { collateral_type: selectedCust.collateral || 'Not recorded', collateral_details: selectedCust.notes || 'N/A', gold_weight_grams: selectedCust.gold_weight || 0, monthly_rate: selectedCust.interest_rate },
        { amountPaid: paid, interestPaid: intPaid, principalDeducted: princPaid, remainingPrincipal: newPrinc, paymentNumber }
      );
    }
    const updatedCustomer = nextCustomers.find(customer => customer.id === selectedCust.id);
    const updatedCalc = calculateInterest(updatedCustomer.principal, updatedCustomer.interest_rate, updatedCustomer.loan_date, updatedCustomer.interest_type, updatedCustomer.interest_carry, updatedCustomer.interest_paid_since_loan_date);
    const paymentUpdate = `Namaste ${selectedCust.name}, aaj ₹${paid.toFixed(2)} payment receive hui. Ismein ₹${intPaid.toFixed(2)} interest jama hua aur ₹${princPaid.toFixed(2)} principal ghata. Ab baki principal ₹${newPrinc.toFixed(2)}, baki interest ₹${updatedCalc.interest.toFixed(2)}, total payable ₹${updatedCalc.total.toFixed(2)} hai. - Sahukar Ledger Pro`;
    const ownerUpdate = `Ledger update: ${selectedCust.name} (ID ${selectedCust.id}) se ₹${paid.toFixed(2)} payment receive hui. Interest ₹${intPaid.toFixed(2)}, principal ₹${princPaid.toFixed(2)}. Updated principal ₹${newPrinc.toFixed(2)}, interest due ₹${updatedCalc.interest.toFixed(2)}, total payable ₹${updatedCalc.total.toFixed(2)}.`;
    notifyWhatsAppTransaction(selectedCust, paymentUpdate, ownerUpdate);

    setActionMessage({ type: 'success', text: receiptAvailable ? 'Confirmed — payment processed successfully.' : 'Payment processed successfully. PDF receipts are available on Pro.' });
    setPayAmount('');
    setSelectedCust(null);
    setPayCustId('');
  };

  const openWhatsAppMessage = (mobile, message) => {
    const phoneNumber = String(mobile || '').replace(/\D/g, '');
    if (phoneNumber.length < 8) return false;
    window.open(`https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
    return true;
  };

  const notifyWhatsAppTransaction = (customer, customerMessage, ownerMessage) => {
    openWhatsAppMessage(customer.mobile, customerMessage);
    const ownerPhone = session?.user?.user_metadata?.phone_number || session?.user?.phone;
    const normalizedOwnerPhone = String(ownerPhone || '').replace(/\D/g, '');
    const normalizedCustomerPhone = String(customer.mobile || '').replace(/\D/g, '');
    if (normalizedOwnerPhone.length >= 8 && normalizedOwnerPhone !== normalizedCustomerPhone) {
      openWhatsAppMessage(ownerPhone, ownerMessage);
    }
  };

  const openWhatsApp = (customer, calc) => {
    const reminderState = consumeWhatsAppReminder(session?.user?.id, customer.id, entitlement);
    if (!reminderState.allowed) {
      const nextDate = new Date(reminderState.nextAvailableAt).toLocaleString('en-IN');
      setActionMessage({ type: 'error', text: `Free plan par is customer ko WhatsApp reminder 24 hours mein ek baar bhej sakte hain. Next reminder: ${nextDate}. Pro plan mein unlimited reminders available hain.` });
      return;
    }
    const interest = Number(calc.livePendingInterest ?? calc.interest ?? 0);
    const principal = Number(calc.currentPrincipal ?? customer.principal ?? 0);
    const total = Number(calc.totalPayableNow ?? calc.total ?? principal + interest);
    const mode = String(customer.interest_type || 'SIMPLE').toUpperCase();
    const message = `*मासिक ब्याज भुगतान सूचना*

Namaste ${customer.name} ji,
Is mahine aapka baki byaaj *₹${interest.toFixed(2)}* hai.

Kripya is mahine ka baki byaaj samay par jama karein. Bhugtan ke baad confirmation bhej dein, taaki aapka record update kiya ja sake.

Aapke sahyog ke liye dhanyavaad.
*Sahukar Ledger Pro*`;
    openWhatsAppMessage(customer.mobile, message);
  };

  const handleAddLoan = async (customer, amount) => {
    const advanceAmount = Number(amount);
    if (!customer || !Number.isFinite(advanceAmount) || advanceAmount <= 0) {
      setActionMessage({ type: 'error', text: 'Additional loan ki valid amount enter karein.' });
      return false;
    }

    const currentCustomer = customers.find(item => item.id === customer.id);
    if (!currentCustomer) {
      setActionMessage({ type: 'error', text: 'Customer record nahi mila. Data refresh karke dobara try karein.' });
      return false;
    }

    try {
      const accrued = calculateInterest(currentCustomer.principal, currentCustomer.interest_rate, currentCustomer.loan_date, currentCustomer.interest_type, currentCustomer.interest_carry, currentCustomer.interest_paid_since_loan_date);
      const today = new Date().toISOString().split('T')[0];
      const updatedCustomer = {
        ...currentCustomer,
        principal: Math.round((Number(currentCustomer.principal || 0) + advanceAmount) * 100) / 100,
        loan_date: today,
        updated_at: new Date().toISOString(),
        interest_carry: accrued.interest,
        interest_paid_since_loan_date: 0,
        last_advance_amount: advanceAmount,
        last_advance_date: today
      };
      const nextCustomers = customers.map(item => item.id === updatedCustomer.id ? updatedCustomer : item);
      await saveData(session.user.id, nextCustomers, payments);
      setProfileCustomer(updatedCustomer);

      const updatedCalc = calculateInterest(updatedCustomer.principal, updatedCustomer.interest_rate, updatedCustomer.loan_date, updatedCustomer.interest_type, updatedCustomer.interest_carry, updatedCustomer.interest_paid_since_loan_date);
      const mode = String(updatedCustomer.interest_type || 'SIMPLE').toLowerCase();
      const customerMessage = `Namaste ${updatedCustomer.name}, aaj aapko ₹${advanceAmount.toFixed(2)} ka additional loan diya gaya. Ab baki principal ₹${updatedCustomer.principal.toFixed(2)}, ${mode} interest ₹${updatedCalc.interest.toFixed(2)}, total payable ₹${updatedCalc.total.toFixed(2)} hai. - Sahukar Ledger Pro`;
      const ownerMessage = `Ledger update: ${updatedCustomer.name} (ID ${updatedCustomer.id}) ko ₹${advanceAmount.toFixed(2)} additional loan diya. Updated principal ₹${updatedCustomer.principal.toFixed(2)}, interest due ₹${updatedCalc.interest.toFixed(2)}, total payable ₹${updatedCalc.total.toFixed(2)}.`;
      notifyWhatsAppTransaction(updatedCustomer, customerMessage, ownerMessage);
      setActionMessage({ type: 'success', text: 'Additional loan record ho gaya. Closed loan ab active hai.' });
      return true;
    } catch (error) {
      console.error('Additional loan could not be saved:', error);
      setActionMessage({ type: 'error', text: 'Additional loan save nahi hua. Ledger verify karke dobara try karein.' });
      return false;
    }
  };

  const deleteCustomer = async (customer) => {
    if (!window.confirm(`${customer.name} ka customer record delete karna hai? Payment history bhi delete hogi.`)) return;
    const nextCustomers = customers.filter(item => item.id !== customer.id);
    const nextPayments = payments.filter(item => item.customer_id !== customer.id);
    try {
      if (!storagePlatform.isWeb) await storageService.deleteCustomerFiles(session.user.id, customer.id);
      await saveData(session.user.id, nextCustomers, nextPayments);
      setProfileCustomer(null);
      setActionMessage({ type: 'success', text: 'Customer record delete ho gaya.' });
    } catch (error) {
      console.error('Customer deletion failed:', error);
      setActionMessage({ type: 'error', text: 'Customer delete nahi hua. Local data ko verify karke dobara try karein.' });
    }
  };

  const savePin = async () => {
    if (!/^\d{4}$/.test(pinValue)) {
      setActionMessage({ type: 'error', text: 'PIN exactly 4 digits ka hona chahiye.' });
      return;
    }

    try {
      await securePin.store(session.user.id, pinValue);
    } catch (error) {
      console.error('PIN storage failed:', error);
      setActionMessage({ type: 'error', text: 'PIN securely save nahi hua. Please dobara try karein.' });
      return;
    }
    setPinSetupRequired(false);
    setPinValue('');
    pinSetupCompletedForUser.current = session.user.id;
    pinInitializationGeneration.current += 1;
    setPinLocked(false);
    setActionMessage({ type: 'success', text: 'Confirmed — security PIN account mein save ho gaya.' });
  };

  const handlePinSetup = async (event) => {
    event.preventDefault();
    if (!/^(\d{4})$/.test(pinSetupDraft)) {
      setActionMessage({ type: 'error', text: 'PIN exactly 4 digits ka hona chahiye.' });
      return;
    }
    if (pinSetupDraft !== pinSetupConfirm) {
      setActionMessage({ type: 'error', text: 'PIN confirm match nahi kar raha hai. Dobara enter karein.' });
      return;
    }

    setPinSetupBusy(true);
    try {
      await securePin.store(session.user.id, pinSetupDraft);
    } catch (error) {
      console.error('PIN setup failed:', error);
      setPinSetupBusy(false);
      setActionMessage({ type: 'error', text: 'PIN set-up failed. Please retry.' });
      return;
    }
    setPinSetupBusy(false);

    pinSetupCompletedForUser.current = session.user.id;
    pinInitializationGeneration.current += 1;
    setPinValue('');
    setPinSetupDraft('');
    setPinSetupConfirm('');
    setPinSetupRequired(false);
    setPinLocked(false);
    setActionMessage({ type: 'success', text: 'PIN set ho gaya. Ab aap app ke saare features use kar sakte hain.' });
  };

  const exportBackup = async () => {
    if (!storagePlatform.isWeb) {
      try {
        const result = await storageService.exportBackup(session.user.id);
        if (!result?.canceled) setActionMessage({ type: 'success', text: 'Backup file export ho gayi.' });
      } catch (error) {
        console.error('Backup export failed:', error);
        setActionMessage({ type: 'error', text: 'Backup export nahi ho saka.' });
      }
      return;
    }
    downloadBackup(serializeJsonBackup(getSessionProfile(session), { customers, payments }), 'application/json', 'json');
  };

  const exportCsvBackup = () => {
    downloadBackup(serializeCsvBackup(getSessionProfile(session), { customers, payments }), 'text/csv;charset=utf-8', 'csv');
  };

  const downloadBackup = (contents, mimeType, extension) => {
    const blob = new Blob([contents], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sahukar-backup-${new Date().toISOString().slice(0, 10)}.${extension}`;
    link.click();
    URL.revokeObjectURL(url);
    setActionMessage({ type: 'success', text: `Backup ${extension.toUpperCase()} download ho gayi.` });
  };

  const handleImportBackup = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const backup = parseBackup(await file.text(), file.name);
      const customerCount = backup.ledger.customers.length;
      const paymentCount = backup.ledger.payments.length;
      if (!window.confirm(`Replace this browser's ledger with ${customerCount} customer(s) and ${paymentCount} transaction(s)?`)) return;
      await saveData(session.user.id, backup.ledger.customers, backup.ledger.payments);
      if (backup.profile) {
        const profile = updateLocalProfile(session.user.id, backup.profile);
        setSession(current => ({
          ...current,
          user: {
            ...current.user,
            email: profile.email || current.user.email,
            phone: profile.phone_number,
            user_metadata: {
              full_name: profile.full_name,
              phone_number: profile.phone_number,
              business_name: profile.business_name
            }
          }
        }));
      }
      setActionMessage({ type: 'success', text: 'Backup restore ho gaya. Ledger aur profile local browser mein save hain.' });
    } catch (error) {
      console.error('Backup import failed:', error);
      setActionMessage({ type: 'error', text: error.message || 'Backup restore nahi ho saka. Existing data was left unchanged.' });
    } finally {
      event.target.value = '';
    }
  };

  if (loading) {
    return <div className="loading-scene min-h-screen bg-slate-950 text-white flex items-center justify-center text-2xl font-bold">Loading Ledger Pro...</div>;
  }

  // 1. AUTHENTICATION GUI
  if (!session) {
    if (showWelcome) {
      return (
        <WelcomeGuide
          onLogin={() => { setAuthMode('LOGIN'); setErrorMsg(''); setSuccessMsg(''); setShowWelcome(false); }}
          onSignup={() => { setAuthMode('SIGNUP'); setErrorMsg(''); setSuccessMsg(''); setShowWelcome(false); }}
          language={lang}
          onLanguage={setLang}
        />
      );
    }

    return (
      <div className="auth-scene min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <CreatorCredit />
        <div className="auth-card bg-white p-8 rounded-xl shadow-2xl w-full max-w-md border border-slate-200">
          <div className="auth-brand -m-8 mb-6 p-6 rounded-t-xl">
            <div className="brand-mark" aria-hidden="true"><span></span><span></span><span></span></div>
            <div>
              <p className="eyebrow">Private ledger suite</p>
              <h1 className="text-2xl font-bold text-white tracking-wide">Sahukar Ledger Pro</h1>
              <p className="brand-subtitle text-sm mt-1">Loan & Ledger Management System</p>
            </div>
          </div>

          <h2 className="text-xl font-bold text-slate-800 text-center mb-4">
            {authMode === 'LOGIN' ? 'Sign In to Account' : 'Create New Account'}
          </h2>

          {errorMsg && (
            <div className="auth-notice auth-notice--error" role="alert">
              <AlertCircle size={19} aria-hidden="true" />
              <div>
                <p className="auth-notice__title">Sign-in details need attention</p>
                <p className="auth-notice__copy">{errorMsg}</p>
              </div>
            </div>
          )}
          {successMsg && <SuccessVisual message={successMsg} />}

          <form onSubmit={handleAuth} className="space-y-4">
            {authMode === 'SIGNUP' && (
              <>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Full Name *</label>
                  <input type="text" required className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 font-semibold" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="e.g. Ramesh Kumar" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Mobile Number *</label>
                  <input type="tel" required className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 font-semibold" value={phone} onChange={e => setPhone(e.target.value)} placeholder="9876543210" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Business / Firm Name</label>
                  <input type="text" className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 font-semibold" value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder="e.g. Shree Ram Finance" />
                </div>
              </>
            )}

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Email ID *</label>
              <input type="email" required className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 font-semibold" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Password *</label>
              <input type="password" required minLength={authMode === 'SIGNUP' ? 8 : undefined} className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 font-semibold" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" />
              <p className="mt-2 text-xs text-slate-500">Account and password stay in this browser. Password recovery is not available without a cloud account.</p>
            </div>

            <button type="submit" disabled={authBusy} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg shadow-md text-base transition duration-150 disabled:cursor-not-allowed disabled:opacity-60">
              {authBusy ? 'Checking...' : authMode === 'LOGIN' ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          <div className="mt-6 text-center border-t pt-4">
            <div className="mb-4 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => triggerDirectDownload(WINDOWS_DOWNLOAD_URL)}
                className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-blue-700"
              >
                Download for Windows / PC
              </button>
              <button
                type="button"
                onClick={() => triggerDirectDownload(ANDROID_DOWNLOAD_URL)}
                className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-700"
              >
                Download for Android
              </button>
            </div>
            <button className="text-sm font-bold text-blue-600 hover:underline" onClick={() => { setAuthMode(authMode === 'LOGIN' ? 'SIGNUP' : 'LOGIN'); setErrorMsg(''); }}>
              {authMode === 'LOGIN' ? "Don't have an account? Sign Up" : "Already have an account? Sign In"}
            </button>
            <button type="button" className="mt-3 block w-full text-sm font-bold text-slate-600 hover:text-slate-900" onClick={() => { setShowWelcome(true); setErrorMsg(''); setSuccessMsg(''); }}>
              Back to welcome guide
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (pinLocked) {
    if (pinSetupRequired) {
      return (
        <div className="fixed inset-0 bg-slate-950 bg-opacity-95 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-white p-8 shadow-2xl">
            <div className="mb-6 text-center">
              <p className="eyebrow">Account security</p>
              <h2 className="text-2xl font-bold text-slate-800">Set your 4-digit PIN</h2>
              <p className="mt-2 text-sm text-slate-500">Ye PIN aapke account ki privacy ke liye use hoga.</p>
            </div>

            <form onSubmit={handlePinSetup} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-bold text-slate-700">New PIN</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={pinSetupDraft}
                  onChange={(event) => setPinSetupDraft(event.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="1234"
                  className="w-full rounded-lg border-2 border-slate-300 p-3 text-center text-xl font-bold focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-bold text-slate-700">Confirm PIN</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={pinSetupConfirm}
                  onChange={(event) => setPinSetupConfirm(event.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="1234"
                  className="w-full rounded-lg border-2 border-slate-300 p-3 text-center text-xl font-bold focus:border-blue-600 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={pinSetupBusy}
                className="w-full rounded-lg bg-blue-600 px-4 py-3 text-base font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pinSetupBusy ? 'Saving PIN...' : 'Save PIN & Continue'}
              </button>
            </form>
          </div>
        </div>
      );
    }

    return <AuthPinModal onAttempt={(enteredPin) => securePin.validate(session.user.id, enteredPin)} onSuccess={() => setPinLocked(false)} />;
  }

  // Dashboard Aggregates
  const totalActiveCust = customers.length;
  const totalPrincipal = customers.reduce((acc, c) => acc + c.principal, 0);
  const totalLiveInterest = customers.reduce((acc, c) => acc + calculateInterest(c.principal, c.interest_rate, c.loan_date).interest, 0);
  const totalRecovered = payments.reduce((acc, p) => acc + p.total_paid, 0);
  const overdueAccounts = customers.filter(c => calculateInterest(c.principal, c.interest_rate, c.loan_date).days >= 30).length;

  // 2. MAIN WEB APP GUI
  return (
    <div className="app-shell min-h-screen bg-slate-100 flex flex-col font-sans">
      <CreatorCredit />
      
      {/* HEADER SECTION */}
      <header className="app-header bg-slate-950 text-white px-4 sm:px-8 py-4 flex flex-wrap gap-4 justify-between items-center shadow-lg">
        <button type="button" className="app-brand app-brand-button" onClick={() => setActiveTab('dash')} aria-label="Go to home dashboard">
          <div className="brand-mark brand-mark--small" aria-hidden="true"><span></span><span></span><span></span></div>
          <div>
            <p className="eyebrow">Sahukar / 2026</p>
            <h1 className="text-2xl font-bold tracking-wide">Sahukar Ledger Pro</h1>
            <p className="text-xs text-slate-400">Welcome, {session.user.user_metadata?.full_name || session.user.email}</p>
          </div>
        </button>
        <div className="flex items-center space-x-4">
          <button
            onClick={() => setLang(lang === 'EN' ? 'HINGLISH' : 'EN')}
            className="border border-slate-600 hover:border-cyan-400 hover:text-cyan-300 font-bold px-4 py-2 rounded-lg text-sm transition">
            {lang === 'EN' ? 'Hinglish' : 'English'}
          </button>
          <button
            type="button"
            onClick={() => triggerDirectDownload(WINDOWS_DOWNLOAD_URL)}
            className="border border-blue-400 text-blue-200 hover:bg-blue-600 font-bold px-3 py-2 rounded-lg text-sm transition"
          >
            Windows Download
          </button>
          <button
            type="button"
            onClick={() => triggerDirectDownload(ANDROID_DOWNLOAD_URL)}
            className="border border-emerald-400 text-emerald-200 hover:bg-emerald-600 font-bold px-3 py-2 rounded-lg text-sm transition"
          >
            Android Download
          </button>
          <button
            onClick={() => {
              signOutLocalAccount();
              setSession(null);
              setCustomers([]);
              setPayments([]);
              setProfileCustomer(null);
              setSelectedCust(null);
              setPinLocked(false);
              setShowWelcome(true);
            }}
            className="bg-red-600 hover:bg-red-700 font-bold px-4 py-2 rounded text-sm text-white transition">
            Log Out
          </button>
        </div>
      </header>

      {/* TABBED NAVIGATION BAR */}
      <nav className="bg-white border-b border-slate-200 px-3 sm:px-6 flex gap-1 overflow-x-auto pt-2">
        <button onClick={() => setActiveTab('dash')} className={`whitespace-nowrap px-4 sm:px-6 py-3 font-bold text-sm rounded-t-lg transition flex items-center gap-2 ${activeTab === 'dash' ? 'bg-slate-50 text-cyan-700 border-b-4 border-cyan-600' : 'text-slate-600 hover:bg-slate-50'}`}>
          <Home size={16} aria-hidden="true" />
          {lang === 'EN' ? 'Home' : 'Ghar'}
        </button>
        <button onClick={() => setActiveTab('dash')} className={`whitespace-nowrap px-4 sm:px-6 py-3 font-bold text-sm rounded-t-lg transition ${activeTab === 'dash' ? 'bg-slate-50 text-cyan-700 border-b-4 border-cyan-600' : 'text-slate-600 hover:bg-slate-50'}`}>
          {lang === 'EN' ? 'Dashboard' : 'Overview'}
        </button>
        <button onClick={() => setActiveTab('add')} className={`whitespace-nowrap px-4 sm:px-6 py-3 font-bold text-sm rounded-t-lg transition ${activeTab === 'add' ? 'bg-slate-50 text-cyan-700 border-b-4 border-cyan-600' : 'text-slate-600 hover:bg-slate-50'}`}>
          {lang === 'EN' ? '+ Add Customer' : '+ Customer Jodein'}
        </button>
        <button onClick={() => setActiveTab('dir')} className={`whitespace-nowrap px-4 sm:px-6 py-3 font-bold text-sm rounded-t-lg transition ${activeTab === 'dir' ? 'bg-slate-50 text-cyan-700 border-b-4 border-cyan-600' : 'text-slate-600 hover:bg-slate-50'}`}>
          {lang === 'EN' ? 'Customer Directory' : 'Customer List'}
        </button>
        <button onClick={() => setActiveTab('pay')} className={`whitespace-nowrap px-4 sm:px-6 py-3 font-bold text-sm rounded-t-lg transition ${activeTab === 'pay' ? 'bg-slate-50 text-cyan-700 border-b-4 border-cyan-600' : 'text-slate-600 hover:bg-slate-50'}`}>
          {lang === 'EN' ? 'Part Payment' : 'Payment Jama'}
        </button>
        <button onClick={() => { setProfileCustomer(null); setActiveTab('ledger'); }} className={`whitespace-nowrap px-4 sm:px-6 py-3 font-bold text-sm rounded-t-lg transition ${activeTab === 'ledger' ? 'bg-slate-50 text-cyan-700 border-b-4 border-cyan-600' : 'text-slate-600 hover:bg-slate-50'}`}>
          Private Ledger
        </button>
        <button onClick={() => setActiveTab('reports')} className={`whitespace-nowrap px-4 sm:px-6 py-3 font-bold text-sm rounded-t-lg transition ${activeTab === 'reports' ? 'bg-slate-50 text-cyan-700 border-b-4 border-cyan-600' : 'text-slate-600 hover:bg-slate-50'}`}>
          Reports
        </button>
        <button onClick={() => setActiveTab('tools')} className={`whitespace-nowrap px-4 sm:px-6 py-3 font-bold text-sm rounded-t-lg transition ${activeTab === 'tools' ? 'bg-slate-50 text-cyan-700 border-b-4 border-cyan-600' : 'text-slate-600 hover:bg-slate-50'}`}>
          {lang === 'EN' ? 'Backup & Tools' : 'Tools'}
        </button>
        <button onClick={() => setActiveTab('downloads')} className={`whitespace-nowrap px-4 sm:px-6 py-3 font-bold text-sm rounded-t-lg transition ${activeTab === 'downloads' ? 'bg-slate-50 text-cyan-700 border-b-4 border-cyan-600' : 'text-slate-600 hover:bg-slate-50'}`}>
          Downloads
        </button>
      </nav>

      {/* MAIN CONTAINER AREA */}
      <main className="flex-1 p-4 sm:p-8 max-w-7xl w-full mx-auto">
        {dataLoading && <div className="mb-4 rounded-lg bg-cyan-50 px-4 py-3 text-sm font-semibold text-cyan-800">Loading local ledger...</div>}
        {dataError && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">Data load failed: {dataError}</div>}
        {actionMessage.text && (actionMessage.type === 'success'
          ? <SuccessVisual message={actionMessage.text} />
          : <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">{actionMessage.text}</div>)}
        
        {/* 1. DASHBOARD TAB */}
        {activeTab === 'dash' && (
          <div className="space-y-6">
            <div className="dashboard-intro">
              <div>
                <p className="eyebrow">Portfolio pulse</p>
                <h2 className="text-2xl font-bold text-slate-800">{lang === 'HI' ? 'व्यापार का विवरण (Business Overview)' : 'Business Overview'}</h2>
                <p className="intro-copy">A single, calm view of every rupee in motion.</p>
              </div>
              <div className="ledger-vault" aria-hidden="true">
                <div className="vault-ring vault-ring--outer"></div>
                <div className="vault-ring vault-ring--inner"></div>
                <div className="vault-core">₹</div>
                <div className="vault-shadow"></div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="metric-card bg-blue-600 text-white p-6 rounded-lg shadow-md">
                <p className="text-lg font-bold">{lang === 'HI' ? 'कुल सक्रिय ग्राहक' : 'Total Active Customers'}</p>
                <p className="text-4xl font-extrabold mt-2">{totalActiveCust}</p>
              </div>
              <div className="metric-card bg-emerald-600 text-white p-6 rounded-lg shadow-md">
                <p className="text-lg font-bold">{lang === 'HI' ? 'बकाया मूलधन (Principal)' : 'Outstanding Principal'}</p>
                <p className="text-4xl font-extrabold mt-2">₹{totalPrincipal.toLocaleString('en-IN', {minimumFractionDigits: 2})}</p>
              </div>
              <div className="metric-card bg-amber-600 text-white p-6 rounded-lg shadow-md">
                <p className="text-lg font-bold">{lang === 'HI' ? 'कुल देय ब्याज (Interest)' : 'Accrued Live Interest'}</p>
                <p className="text-4xl font-extrabold mt-2">₹{totalLiveInterest.toLocaleString('en-IN', {minimumFractionDigits: 2})}</p>
              </div>
              <div className="metric-card bg-purple-600 text-white p-6 rounded-lg shadow-md">
                <p className="text-lg font-bold">{lang === 'HI' ? 'कुल वसूल की गई राशि' : 'Total Recovered Payments'}</p>
                <p className="text-4xl font-extrabold mt-2">₹{totalRecovered.toLocaleString('en-IN', {minimumFractionDigits: 2})}</p>
              </div>
              <div className="metric-card bg-red-600 text-white p-6 rounded-lg shadow-md">
                <p className="text-lg font-bold">{lang === 'HI' ? 'ओवरड्यू खाते (≥30 दिन)' : 'Overdue Accounts (≥30 Days)'}</p>
                <p className="text-4xl font-extrabold mt-2">{overdueAccounts} {lang === 'HI' ? 'ग्राहक देय हैं' : 'Customers Due'}</p>
              </div>
            </div>
          </div>
        )}

        {/* 2. ADD CUSTOMER TAB */}
        {activeTab === 'add' && (
          <div className="bg-white p-8 rounded-lg shadow-md border max-w-4xl">
            <h2 className="text-xl font-bold text-slate-800 mb-6 border-b pb-2">
              {lang === 'HI' ? 'नया ग्राहक रिकॉर्ड जोड़ें' : 'Add New Customer Record'}
            </h2>
            <form onSubmit={handleSaveCustomer} className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-base font-bold text-slate-700 mb-1">{lang === 'HI' ? 'ग्राहक का नाम *' : 'Customer Name*'}</label>
                <input type="text" required className="w-full p-3 text-lg border-2 rounded focus:border-blue-600" value={custForm.name} onChange={e => setCustForm({...custForm, name: e.target.value})} />
              </div>
              <div>
                <label className="block text-base font-bold text-slate-700 mb-1">{lang === 'HI' ? 'मोबाइल नंबर *' : 'Mobile Number*'}</label>
                <input type="tel" required className="w-full p-3 text-lg border-2 rounded focus:border-blue-600" value={custForm.mobile} onChange={e => setCustForm({...custForm, mobile: e.target.value})} />
              </div>
              <div>
                <label className="block text-base font-bold text-slate-700 mb-1">{lang === 'HI' ? 'पता' : 'Address'}</label>
                <input type="text" className="w-full p-3 text-lg border-2 rounded focus:border-blue-600" value={custForm.address} onChange={e => setCustForm({...custForm, address: e.target.value})} />
              </div>
              <div>
                <label className="block text-base font-bold text-slate-700 mb-1">{lang === 'HI' ? 'सरकारी पहचान पत्र (Govt ID)' : 'Govt ID Doc'}</label>
                <input type="text" className="w-full p-3 text-lg border-2 rounded focus:border-blue-600" value={custForm.gov_id} onChange={e => setCustForm({...custForm, gov_id: e.target.value})} />
              </div>
              <div>
                <label className="block text-base font-bold text-slate-700 mb-1">{lang === 'HI' ? 'मूलधन राशि (₹)*' : 'Principal Amount (₹)*'}</label>
                <input type="number" step="any" required className="w-full p-3 text-lg border-2 rounded focus:border-blue-600 font-bold" value={custForm.principal} onChange={e => setCustForm({...custForm, principal: e.target.value})} />
              </div>
              <div>
                <label className="block text-base font-bold text-slate-700 mb-1">{lang === 'HI' ? 'ब्याज दर (%/माह) *' : 'Interest Rate (%/month)*'}</label>
                <input type="number" step="any" required className="w-full p-3 text-lg border-2 rounded focus:border-blue-600 font-bold" value={custForm.interest_rate} onChange={e => setCustForm({...custForm, interest_rate: e.target.value})} />
              </div>
              <div>
                <label className="block text-base font-bold text-slate-700 mb-1">Interest Type</label>
                <select className="w-full p-3 text-lg border-2 rounded focus:border-blue-600 font-bold" value={custForm.interest_type} onChange={e => setCustForm({...custForm, interest_type: e.target.value})}>
                  <option value="SIMPLE">Simple Interest</option>
                  <option value="COMPOUND">Compound Interest</option>
                </select>
              </div>
              <div>
                <label className="block text-base font-bold text-slate-700 mb-1">{lang === 'HI' ? 'ऋण तिथि (YYYY-MM-DD)*' : 'Loan Date (YYYY-MM-DD)*'}</label>
                <input type="date" required className="w-full p-3 text-lg border-2 rounded focus:border-blue-600" value={custForm.loan_date} onChange={e => setCustForm({...custForm, loan_date: e.target.value})} />
              </div>
              <div>
                <label className="block text-base font-bold text-slate-700 mb-1">{lang === 'HI' ? 'बंधक/गिरवी सामान' : 'Collateral Item'}</label>
                <input type="text" className="w-full p-3 text-lg border-2 rounded focus:border-blue-600" value={custForm.collateral} onChange={e => setCustForm({...custForm, collateral: e.target.value})} />
              </div>
              <div className="md:col-span-2">
                <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xl py-4 rounded shadow-lg transition">
                  {lang === 'HI' ? 'ग्राहक रिकॉर्ड सहेजें' : 'Save Customer Record'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* 3. CUSTOMER DIRECTORY TAB */}
        {activeTab === 'dir' && !profileCustomer && (
          <CustomerDirectory customers={customers} onOpenProfile={setProfileCustomer} onDeleteCustomer={deleteCustomer} onWhatsApp={openWhatsApp} onSelectPayment={(customer) => { setPayCustId(String(customer.id)); setActiveTab('pay'); }} />
        )}

        {activeTab === 'dir' && profileCustomer && (
          <CustomerProfile customer={profileCustomer} payments={payments} onBack={() => setProfileCustomer(null)} onPay={() => { setPayCustId(String(profileCustomer.id)); setActiveTab('pay'); setProfileCustomer(null); }} onAddLoan={handleAddLoan} onWhatsApp={() => openWhatsApp(profileCustomer, calculateInterest(profileCustomer.principal, profileCustomer.interest_rate, profileCustomer.loan_date, profileCustomer.interest_type, profileCustomer.interest_carry, profileCustomer.interest_paid_since_loan_date))} />
        )}

        {/* 4. PART PAYMENT TAB */}
        {activeTab === 'pay' && (
          <div className="bg-white p-8 rounded-lg shadow-md border max-w-3xl space-y-6">
            <h2 className="text-xl font-bold text-slate-800 border-b pb-2">{lang === 'HI' ? 'पार्ट पेमेंट दर्ज करें' : 'Part Payment Entry'}</h2>
            
            <div className="flex space-x-4 items-center">
              <label className="font-bold text-lg">{lang === 'HI' ? 'ग्राहक आईडी:' : 'Customer ID:'}</label>
              <input type="number" className="p-3 border-2 rounded text-lg font-bold w-32" value={payCustId} onChange={e => setPayCustId(e.target.value)} />
              <button onClick={handleFetchCustomerForPay} className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-6 py-3 rounded text-base">
                {lang === 'HI' ? 'विवरण लोड करें' : 'Fetch Details'}
              </button>
            </div>

            {selectedCust && (
              <div className="bg-slate-50 p-6 rounded-lg border-2 border-slate-200 space-y-2 text-lg">
                <p><strong>Name:</strong> {selectedCust.name} | <strong>Mobile:</strong> {selectedCust.mobile}</p>
                <p><strong>Principal:</strong> ₹{selectedCust.principal} | <strong>Rate:</strong> {selectedCust.interest_rate}%/month</p>
                <p><strong>Accrued Interest:</strong> ₹{selectedCust.interest}</p>
                <p className="text-xl font-bold text-blue-700"><strong>Total Payable:</strong> ₹{selectedCust.total}</p>

                <div className="pt-4 flex items-center space-x-4">
                  <label className="font-bold">{lang === 'HI' ? 'भुगतान राशि (₹):' : 'Paid Amount (₹):'}</label>
                  <input type="number" className="p-3 border-2 rounded text-lg font-bold w-48" value={payAmount} onChange={e => setPayAmount(e.target.value)} />
                  <button onClick={handleProcessPayment} className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-3 rounded text-lg">
                    {lang === 'HI' ? 'भुगतान दर्ज करें' : 'Process Payment'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'ledger' && <PrivateLedger customers={customers} payments={payments} onOpenCustomer={(customer) => { setProfileCustomer(customer); setActiveTab('dir'); }} />}

        {activeTab === 'reports' && <Reports customers={customers} payments={payments} />}

        {activeTab === 'downloads' && (
          <div className="bg-white p-8 rounded-lg shadow-md border max-w-3xl space-y-6">
            <div>
              <p className="eyebrow">Sahukar Ledger Pro</p>
              <h2 className="text-2xl font-bold text-slate-800">Download Apps</h2>
              <p className="mt-2 text-slate-600">Apne computer ya Android device ke liye app download karein.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => triggerDirectDownload(WINDOWS_DOWNLOAD_URL)}
                className="rounded-lg bg-blue-600 p-5 font-bold text-white transition hover:bg-blue-700 text-left"
              >
                <span className="block text-lg">Download for Windows / PC</span>
                <span className="mt-1 block text-sm font-medium text-blue-100">EXE installer for PC and laptop</span>
              </button>
              <button
                type="button"
                onClick={() => triggerDirectDownload(ANDROID_DOWNLOAD_URL)}
                className="rounded-lg bg-emerald-600 p-5 font-bold text-white transition hover:bg-emerald-700 text-left"
              >
                <span className="block text-lg">Download for Android</span>
                <span className="mt-1 block text-sm font-medium text-emerald-100">APK installer for mobile</span>
              </button>
            </div>
          </div>
        )}

        {/* 5. BACKUP & TOOLS TAB */}
        {activeTab === 'tools' && (
          <div className="bg-white p-8 rounded-lg shadow-md border max-w-2xl space-y-4">
            <h2 className="text-xl font-bold text-slate-800 border-b pb-2">{lang === 'HI' ? 'डेटाबेस व सुरक्षा टूल्स' : 'Database & Security Tools'}</h2>
            <p className="text-base text-slate-600">Your account and ledger are stored only in this browser. Download backups regularly; clearing browser data removes local records.</p>
            <div className="settings-block" aria-live="polite">
              <h3 className="font-bold text-slate-800">Subscription</h3>
              <p className="mt-2 text-sm text-slate-600">
                Current plan: <strong>{getCurrentPlan(entitlement) === 'pro' ? `Pro${entitlement.billing_cycle ? ` ${entitlement.billing_cycle}` : ''}` : 'Free'}</strong>
                {' · '}Status: <strong>{getSubscriptionStatus(entitlement)}</strong>
                {entitlement.source === 'local' && <span> · Local account</span>}
              </p>
              {entitlement.expiry_date && <p className="mt-1 text-sm text-slate-600">Expiry: {new Date(entitlement.expiry_date).toLocaleDateString()}</p>}
              {!isPro(entitlement) && <p className="mt-1 text-xs text-slate-500">Free plan: {customers.length}/{FREE_CUSTOMER_LIMIT} customers. Existing ledger data is never removed by plan limits.</p>}
              <button type="button" onClick={() => setActionMessage({ type: 'success', text: `Pro plans: ₹${PLAN_PRICING.proMonthly}/month or ₹${PLAN_PRICING.proYearly}/year. Payment checkout is not enabled yet.` })} className="mt-3 rounded-lg border border-slate-300 px-4 py-2 font-bold text-slate-700 transition hover:border-cyan-600 hover:text-cyan-700">
                Upgrade to Pro · ₹{PLAN_PRICING.proMonthly}/month · ₹{PLAN_PRICING.proYearly}/year
              </button>
            </div>
            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="button"
                onClick={() => triggerDirectDownload(WINDOWS_DOWNLOAD_URL)}
                className="rounded-lg bg-blue-600 px-4 py-2.5 font-bold text-white transition hover:bg-blue-700"
              >
                Download for Windows / PC
              </button>
              <button
                type="button"
                onClick={() => triggerDirectDownload(ANDROID_DOWNLOAD_URL)}
                className="rounded-lg bg-emerald-600 px-4 py-2.5 font-bold text-white transition hover:bg-emerald-700"
              >
                Download for Android
              </button>
              <button onClick={exportBackup} className="rounded-lg border border-slate-300 px-4 py-2.5 font-bold text-slate-700 transition hover:border-cyan-600 hover:text-cyan-700">Download JSON Backup</button>
              {storagePlatform.isWeb && <>
                <button onClick={exportCsvBackup} className="rounded-lg border border-slate-300 px-4 py-2.5 font-bold text-slate-700 transition hover:border-cyan-600 hover:text-cyan-700">Download CSV Backup</button>
                <button type="button" onClick={() => backupFileInputRef.current?.click()} className="rounded-lg bg-cyan-700 px-4 py-2.5 font-bold text-white transition hover:bg-cyan-800">Import JSON / CSV</button>
                <input ref={backupFileInputRef} type="file" accept=".json,.csv,application/json,text/csv" onChange={handleImportBackup} className="hidden" aria-label="Choose a JSON or CSV backup file" />
              </>}
              <button onClick={() => setPinLocked(true)} className="action-button action-button--dark"><LockKeyhole size={16} /> Lock now</button>
            </div>
            <div className="settings-block">
              <h3 className="font-bold text-slate-800">Change security PIN</h3>
              <div className="mt-3 flex flex-wrap gap-3"><input type="password" inputMode="numeric" maxLength="4" value={pinValue} onChange={event => setPinValue(event.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="4 digit PIN" className="p-3 border-2 rounded-lg font-bold" /><button onClick={savePin} className="action-button action-button--primary">Save PIN</button></div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}