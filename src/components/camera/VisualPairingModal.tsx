import React, { useState, useEffect } from 'react';
import API from '../../api';
import { useAuth } from '../../context/AuthContext';
import {
  Tag, Plus, Trash2, CheckCircle2, AlertTriangle,
  RefreshCw, Camera, Box, Barcode, ArrowRightLeft,
  Sliders, Crown, Sparkles, X
} from 'lucide-react';

interface PairingBlock {
  _id: string;
  blockCode: string;
  name: string;
  category: 'GALLA' | 'REUSABLE_CAN' | 'SHELF' | 'GATE_TRIPWIRE' | 'MACHINERY' | 'CUSTOM';
  color: string;
  barcode?: string;
  cameraChannel: number;
  coordinates: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  tripwireConfig?: {
    type: 'BI_DIRECTIONAL' | 'OUT_ONLY' | 'IN_ONLY';
    lineInY: number;
    lineOutY: number;
    alertOnMissingAtEOD: boolean;
  };
  shelfConfig?: {
    pickCount: number;
    capacity: number;
    lastPickAt?: string;
  };
  gateStatus?: {
    status: 'INSIDE_SHOP' | 'OUTSIDE_SHOP' | 'IN_TRANSIT';
    lastExitTime?: string;
    lastReturnTime?: string;
    exitCountToday: number;
    returnCountToday: number;
  };
  status: 'ACTIVE' | 'DISPLACED' | 'OUT_OF_SHOP' | 'MISSING';
  totalPicks: number;
}

interface QuotaInfo {
  planTier: string;
  allowedBlocksLimit: number;
  freeBlocksCount: number;
  isPaidPlanActive: boolean;
  usedBlocksCount: number;
  remainingBlocks: number;
  canAddBlock: boolean;
}

interface TenantLimitItem {
  id: string;
  name: string;
  ownerName: string;
  mobile: string;
  planTier: string;
  allowedBlocksLimit: number;
  freeBlocksCount: number;
  isPaidPlanActive: boolean;
  usedBlocksCount: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  cameras: any[];
}

const COLOR_PALETTE = [
  { hex: '#EF4444', label: 'लाल (Red) - हाई सिक्योरिटी / गल्ला' },
  { hex: '#10B981', label: 'हरा (Green) - रियूजेबल कैन / IN-OUT' },
  { hex: '#3B82F6', label: 'नीला (Blue) - किराना शेल्फ / रैक' },
  { hex: '#F59E0B', label: 'पीला (Yellow) - डेयरी मशीनरी' },
  { hex: '#8B5CF6', label: 'बैंगनी (Purple) - केमिकल / स्टोरेज' },
  { hex: '#F97316', label: 'नारंगी (Orange) - दूध थैली / क्रेट' },
  { hex: '#EC4899', label: 'गुलाबी (Pink) - वेइंग स्केल / काउंटर' },
  { hex: '#06B6D4', label: 'आसमानी (Cyan) - गेट ट्रिपवायर लाइन' }
];

export const VisualPairingModal: React.FC<Props> = ({ isOpen, onClose, cameras }) => {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'SuperAdmin';

  const [activeTab, setActiveTab] = useState<'blocks' | 'cans' | 'shelves' | 'admin'>('blocks');
  const [blocks, setBlocks] = useState<PairingBlock[]>([]);
  const [loading, setLoading] = useState(false);
  const [quota, setQuota] = useState<QuotaInfo | null>(null);

  // New Block Form
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [blockCode, setBlockCode] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState<PairingBlock['category']>('GALLA');
  const [color, setColor] = useState('#EF4444');
  const [barcode, setBarcode] = useState('');
  const [cameraChannel, setCameraChannel] = useState<number>(1);
  const [coordX, setCoordX] = useState<number>(15);
  const [coordY, setCoordY] = useState<number>(15);
  const [coordW, setCoordW] = useState<number>(30);
  const [coordH, setCoordH] = useState<number>(30);
  const [savingBlock, setSavingBlock] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Reusable Cans & Gate Summary
  const [reusableSummary, setReusableSummary] = useState<any>(null);

  // Super Admin Tenant Limits
  const [allTenants, setAllTenants] = useState<TenantLimitItem[]>([]);
  const [loadingTenants, setLoadingTenants] = useState(false);
  const [selectedTenantToEdit, setSelectedTenantToEdit] = useState<TenantLimitItem | null>(null);
  const [adminTier, setAdminTier] = useState<string>('FREE');
  const [adminLimit, setAdminLimit] = useState<number>(15);
  const [adminFreeCount, setAdminFreeCount] = useState<number>(15);
  const [savingAdminLimit, setSavingAdminLimit] = useState(false);

  // Fetch Blocks and Quota
  const fetchData = async () => {
    try {
      setLoading(true);
      const [blocksRes, quotaRes, cansRes] = await Promise.all([
        API.get('/cameras/pairing-blocks'),
        API.get('/tenants/my-pairing-quota'),
        API.get('/cameras/pairing-blocks/reusable-summary')
      ]);

      if (blocksRes.data?.blocks) setBlocks(blocksRes.data.blocks);
      if (quotaRes.data?.quota) setQuota(quotaRes.data.quota);
      if (cansRes.data?.summary) setReusableSummary(cansRes.data);
    } catch (err: any) {
      console.error('Error fetching visual pairing data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch Super Admin Tenants list
  const fetchAdminTenants = async () => {
    if (!isSuperAdmin) return;
    try {
      setLoadingTenants(true);
      const res = await API.get('/tenants/admin/pairing-limits');
      if (res.data?.tenants) {
        setAllTenants(res.data.tenants);
      }
    } catch (err) {
      console.error('Error fetching admin tenants:', err);
    } finally {
      setLoadingTenants(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchData();
      if (isSuperAdmin) {
        fetchAdminTenants();
      }
    }
  }, [isOpen, isSuperAdmin]);

  const resetForm = () => {
    setEditingBlockId(null);
    setBlockCode(`BLK-${String(blocks.length + 1).padStart(2, '0')}`);
    setName('');
    setCategory('GALLA');
    setColor('#EF4444');
    setBarcode('');
    setCameraChannel(cameras[0]?.channel || 1);
    setCoordX(15);
    setCoordY(15);
    setCoordW(30);
    setCoordH(30);
    setFormError(null);
  };

  const openEditBlock = (b: PairingBlock) => {
    setEditingBlockId(b._id);
    setBlockCode(b.blockCode);
    setName(b.name);
    setCategory(b.category);
    setColor(b.color || '#3B82F6');
    setBarcode(b.barcode || '');
    setCameraChannel(b.cameraChannel || 1);
    setCoordX(b.coordinates?.x || 15);
    setCoordY(b.coordinates?.y || 15);
    setCoordW(b.coordinates?.width || 30);
    setCoordH(b.coordinates?.height || 30);
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleSaveBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!blockCode.trim() || !name.trim()) {
      setFormError('Block Code और Name भरना अनिवार्य है।');
      return;
    }

    try {
      setSavingBlock(true);
      await API.post('/cameras/pairing-blocks', {
        id: editingBlockId,
        blockCode,
        name,
        category,
        color,
        barcode,
        cameraChannel,
        coordinates: {
          x: coordX,
          y: coordY,
          width: coordW,
          height: coordH
        }
      });

      setIsFormOpen(false);
      resetForm();
      fetchData();
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Block सहेजने में विफल।';
      setFormError(msg);
    } finally {
      setSavingBlock(false);
    }
  };

  const handleDeleteBlock = async (id: string) => {
    if (!window.confirm('क्या आप इस Visual Pairing Block को हटाना चाहते हैं?')) return;
    try {
      await API.delete(`/cameras/pairing-blocks/${id}`);
      fetchData();
    } catch (err) {
      alert('हटाने में विफल');
    }
  };

  const handleRecordShelfPick = async (id: string) => {
    try {
      await API.post(`/cameras/pairing-blocks/${id}/record-pick`, { count: 1 });
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleRecordGateMovement = async (id: string, direction: 'IN' | 'OUT') => {
    try {
      await API.post(`/cameras/pairing-blocks/${id}/record-gate`, { direction, isBilled: true });
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveAdminTenantLimit = async () => {
    if (!selectedTenantToEdit) return;
    try {
      setSavingAdminLimit(true);
      await API.put(`/tenants/admin/pairing-limits/${selectedTenantToEdit.id}`, {
        planTier: adminTier,
        allowedBlocksLimit: adminLimit,
        freeBlocksCount: adminFreeCount,
        isPaidPlanActive: adminTier === 'PAID'
      });
      setSelectedTenantToEdit(null);
      fetchAdminTenants();
      fetchData();
    } catch (err) {
      alert('अपडेट विफल');
    } finally {
      setSavingAdminLimit(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-dark-900 border border-dark-700 w-full max-w-4xl rounded-3xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden text-white animate-fade-in">
        
        {/* Header with Quota Badge */}
        <div className="p-4 sm:p-5 border-b border-dark-800 flex items-center justify-between bg-dark-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold tracking-tight">AI विज़ुअल पेयरिंग व एसेट टैगिंग हब</h3>
                {quota && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    quota.planTier === 'PAID'
                      ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                      : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                  }`}>
                    {quota.planTier === 'PAID' ? '👑 PRO PLAN' : '🆓 FREE PLAN'}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-dark-400">
                बारकोड, शेल्फ पिक व गेट ट्रिपवायर को कैमरों से लाइव टैग करें (कलर-कोडेड)
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-dark-400 hover:text-white hover:bg-dark-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quota Progress Bar */}
        {quota && (
          <div className="px-5 py-2.5 bg-dark-950/40 border-b border-dark-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-dark-300">ब्लॉक कोटा:</span>
              <span className="font-bold text-white">
                {quota.usedBlocksCount} / {quota.allowedBlocksLimit} ब्लॉक्स उपयोग किए गए
              </span>
              <span className="text-[10px] text-dark-400">
                ({quota.remainingBlocks} बाकी)
              </span>
            </div>

            <div className="flex items-center gap-3 flex-1 max-w-xs">
              <div className="w-full bg-dark-800 h-2 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-300 ${
                    quota.usedBlocksCount >= quota.allowedBlocksLimit 
                      ? 'bg-rose-500' 
                      : quota.usedBlocksCount > quota.allowedBlocksLimit * 0.8
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(100, (quota.usedBlocksCount / quota.allowedBlocksLimit) * 100)}%` }}
                />
              </div>
              <span className="text-[10px] font-bold text-dark-400">
                {Math.round((quota.usedBlocksCount / quota.allowedBlocksLimit) * 100)}%
              </span>
            </div>

            {!quota.canAddBlock && (
              <span className="text-[10px] font-bold text-rose-400 bg-rose-950/50 px-2 py-0.5 rounded border border-rose-800/40">
                ⚠️ लिमिट पूरी हो गई है
              </span>
            )}
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 px-5 pt-3 border-b border-dark-800 bg-dark-900/60 overflow-x-auto text-xs">
          <button
            onClick={() => setActiveTab('blocks')}
            className={`pb-2.5 px-3 font-semibold border-b-2 flex items-center gap-1.5 transition whitespace-nowrap ${
              activeTab === 'blocks'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-dark-400 hover:text-white'
            }`}
          >
            <Tag className="w-3.5 h-3.5" />
            विज़ुअल ब्लॉक्स ({blocks.length})
          </button>

          <button
            onClick={() => setActiveTab('cans')}
            className={`pb-2.5 px-3 font-semibold border-b-2 flex items-center gap-1.5 transition whitespace-nowrap ${
              activeTab === 'cans'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-dark-400 hover:text-white'
            }`}
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
            रियूजेबल कैन व गेट ट्रिपवायर (Camera 4)
          </button>

          <button
            onClick={() => setActiveTab('shelves')}
            className={`pb-2.5 px-3 font-semibold border-b-2 flex items-center gap-1.5 transition whitespace-nowrap ${
              activeTab === 'shelves'
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-dark-400 hover:text-white'
            }`}
          >
            <Box className="w-3.5 h-3.5" />
            शेल्फ पिक काउंटर्स
          </button>

          {isSuperAdmin && (
            <button
              onClick={() => setActiveTab('admin')}
              className={`pb-2.5 px-3 font-semibold border-b-2 flex items-center gap-1.5 transition whitespace-nowrap ${
                activeTab === 'admin'
                  ? 'border-amber-500 text-amber-400'
                  : 'border-transparent text-dark-400 hover:text-white'
              }`}
            >
              <Crown className="w-3.5 h-3.5" />
              दुकानदार लिमिट कंट्रोल (Super Admin)
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">

          {/* TAB 1: VISUAL PAIRING BLOCKS */}
          {activeTab === 'blocks' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-white">टैग किए गए एसेट्स व ब्लॉक्स</h4>
                  <p className="text-[11px] text-dark-400">दुकान के सामान, गल्ला व शेल्फ के लिए कलर-कोडेड कैमरा ब्लॉक्स</p>
                </div>

                {!isFormOpen && (
                  <button
                    onClick={() => {
                      resetForm();
                      setIsFormOpen(true);
                    }}
                    disabled={quota ? !quota.canAddBlock : false}
                    className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-indigo-900/30 transition"
                  >
                    <Plus className="w-4 h-4" />
                    नया ब्लॉक जोड़ें
                  </button>
                )}
              </div>

              {/* Add / Edit Form */}
              {isFormOpen && (
                <form onSubmit={handleSaveBlock} className="bg-dark-950/80 border border-dark-700/80 rounded-2xl p-4 space-y-4">
                  <div className="flex items-center justify-between border-b border-dark-800 pb-2">
                    <h5 className="text-xs font-bold text-indigo-400 flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5" />
                      {editingBlockId ? 'ब्लॉक संपादित करें' : 'नया विज़ुअल ब्लॉक कॉन्फ़िगर करें'}
                    </h5>
                    <button
                      type="button"
                      onClick={() => setIsFormOpen(false)}
                      className="text-dark-400 hover:text-white text-xs"
                    >
                      रद्द करें
                    </button>
                  </div>

                  {formError && (
                    <div className="p-2.5 rounded-xl bg-rose-950/50 border border-rose-800/40 text-rose-300 text-xs flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>{formError}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="text-dark-400 block mb-1 font-medium">ब्लॉक कोड (Block Code)</label>
                      <input
                        type="text"
                        value={blockCode}
                        onChange={(e) => setBlockCode(e.target.value.toUpperCase())}
                        placeholder="e.g. GALLA-01, CAN-01"
                        className="w-full bg-dark-900 border border-dark-700 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-indigo-500"
                        required
                      />
                    </div>

                    <div>
                      <label className="text-dark-400 block mb-1 font-medium">एसेट नाम (Asset Name)</label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. मुख्य गल्ला, 50L मिल्क कैन, घी शेल्फ"
                        className="w-full bg-dark-900 border border-dark-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                        required
                      />
                    </div>

                    <div>
                      <label className="text-dark-400 block mb-1 font-medium">कैटेगरी (Category)</label>
                      <select
                        value={category}
                        onChange={(e: any) => {
                          setCategory(e.target.value);
                          if (e.target.value === 'GALLA') setColor('#EF4444');
                          else if (e.target.value === 'REUSABLE_CAN') setColor('#10B981');
                          else if (e.target.value === 'SHELF') setColor('#3B82F6');
                          else if (e.target.value === 'MACHINERY') setColor('#F59E0B');
                        }}
                        className="w-full bg-dark-900 border border-dark-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                      >
                        <option value="GALLA">🔴 मुख्य गल्ला / कैश काउंटर (GALLA)</option>
                        <option value="REUSABLE_CAN">🟢 रियूजेबल मिल्क कैन / टंकी (GATE IN/OUT)</option>
                        <option value="SHELF">🔵 किराना / प्रोडक्ट शेल्फ (PICK COUNTER)</option>
                        <option value="GATE_TRIPWIRE">🟡 गेट ट्रिपवायर लाइन (TRIPWIRE)</option>
                        <option value="MACHINERY">🟣 डेयरी मशीनरी / चिलर (MACHINERY)</option>
                        <option value="CUSTOM">🟠 अन्य कस्टम एसेट (CUSTOM)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-dark-400 block mb-1 font-medium">कैमरा चैनल (Camera Channel)</label>
                      <select
                        value={cameraChannel}
                        onChange={(e) => setCameraChannel(Number(e.target.value))}
                        className="w-full bg-dark-900 border border-dark-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                      >
                        {cameras.map((c) => (
                          <option key={c._id} value={c.channel || 1}>
                            कैमरा {c.channel || 1} - {c.name} ({c.locationType})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Color Selector */}
                  <div>
                    <label className="text-dark-400 block mb-1.5 font-medium text-xs">
                      कलर कोडिंग (कैमरे पर इस रंग का बॉक्स दिखेगा):
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {COLOR_PALETTE.map((c) => (
                        <button
                          key={c.hex}
                          type="button"
                          onClick={() => setColor(c.hex)}
                          className={`flex items-center gap-2 p-2 rounded-xl border text-[11px] transition text-left ${
                            color === c.hex 
                              ? 'border-white bg-dark-800 shadow-md ring-1 ring-white/50' 
                              : 'border-dark-800 bg-dark-900/60 hover:bg-dark-850'
                          }`}
                        >
                          <span 
                            className="w-3.5 h-3.5 rounded-full shrink-0 shadow-sm"
                            style={{ backgroundColor: c.hex }}
                          />
                          <span className="truncate">{c.label.split('-')[0]}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Physical Barcode / QR text */}
                  <div>
                    <label className="text-dark-400 block mb-1 font-medium text-xs">
                      भौतिक बारकोड / QR स्टिकर कोड (वैकल्पिक):
                    </label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Barcode className="w-4 h-4 text-dark-500 absolute left-3 top-2.5" />
                        <input
                          type="text"
                          value={barcode}
                          onChange={(e) => setBarcode(e.target.value)}
                          placeholder="हैंडहेल्ड स्कैनर से स्कैन करें या बारकोड टाइप करें"
                          className="w-full bg-dark-900 border border-dark-700 rounded-xl pl-9 pr-3 py-2 text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Coordinates Sliders */}
                  <div className="bg-dark-900/70 p-3 rounded-xl border border-dark-800 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-dark-300 flex items-center gap-1.5">
                        <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                        कैमरा विज़ुअल बॉक्स पोजिशन (%)
                      </span>
                      <span 
                        className="px-2 py-0.5 rounded text-[10px] font-bold"
                        style={{ backgroundColor: `${color}20`, color, borderColor: `${color}40`, borderWidth: 1 }}
                      >
                        X: {coordX}% | Y: {coordY}% | W: {coordW}% | H: {coordH}%
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                      <div>
                        <span className="text-dark-400">X (बाएँ से): {coordX}%</span>
                        <input
                          type="range"
                          min="0"
                          max="90"
                          value={coordX}
                          onChange={(e) => setCoordX(Number(e.target.value))}
                          className="w-full accent-indigo-500"
                        />
                      </div>
                      <div>
                        <span className="text-dark-400">Y (ऊपर से): {coordY}%</span>
                        <input
                          type="range"
                          min="0"
                          max="90"
                          value={coordY}
                          onChange={(e) => setCoordY(Number(e.target.value))}
                          className="w-full accent-indigo-500"
                        />
                      </div>
                      <div>
                        <span className="text-dark-400">चौड़ाई (W): {coordW}%</span>
                        <input
                          type="range"
                          min="10"
                          max="80"
                          value={coordW}
                          onChange={(e) => setCoordW(Number(e.target.value))}
                          className="w-full accent-indigo-500"
                        />
                      </div>
                      <div>
                        <span className="text-dark-400">ऊंचाई (H): {coordH}%</span>
                        <input
                          type="range"
                          min="10"
                          max="80"
                          value={coordH}
                          onChange={(e) => setCoordH(Number(e.target.value))}
                          className="w-full accent-indigo-500"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsFormOpen(false)}
                      className="px-3.5 py-1.5 bg-dark-800 hover:bg-dark-700 text-dark-300 rounded-xl text-xs font-semibold"
                    >
                      रद्द करें
                    </button>
                    <button
                      type="submit"
                      disabled={savingBlock}
                      className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-md flex items-center gap-1.5"
                    >
                      {savingBlock ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                      ब्लॉक सहेजें
                    </button>
                  </div>
                </form>
              )}

              {/* Blocks Grid */}
              {loading ? (
                <div className="text-center py-10 text-dark-400 flex flex-col items-center gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" />
                  <p className="text-xs">विज़ुअल ब्लॉक्स लोड हो रहे हैं...</p>
                </div>
              ) : blocks.length === 0 ? (
                <div className="text-center py-10 bg-dark-950/40 rounded-2xl border border-dashed border-dark-800 p-6 space-y-3">
                  <Tag className="w-8 h-8 text-dark-600 mx-auto" />
                  <h5 className="text-xs font-semibold text-white">कोई विज़ुअल ब्लॉक कॉन्फ़िगर नहीं है</h5>
                  <p className="text-[11px] text-dark-400 max-w-sm mx-auto">
                    गल्ला, मिल्क कैन या शेल्फ को कैमरे पर टैग करने के लिए "नया ब्लॉक जोड़ें" पर क्लिक करें।
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {blocks.map((b) => (
                    <div
                      key={b._id}
                      className="bg-dark-950/70 border border-dark-800 rounded-2xl p-3.5 space-y-2.5 relative overflow-hidden transition hover:border-dark-700"
                    >
                      {/* Top Color Accent Strip */}
                      <div 
                        className="absolute top-0 left-0 right-0 h-1"
                        style={{ backgroundColor: b.color || '#3B82F6' }}
                      />

                      <div className="flex items-start justify-between gap-2 pt-1">
                        <div className="flex items-center gap-2">
                          <span 
                            className="w-3 h-3 rounded-full shrink-0 shadow-sm"
                            style={{ backgroundColor: b.color || '#3B82F6' }}
                          />
                          <div>
                            <h5 className="text-xs font-bold text-white tracking-tight">{b.name}</h5>
                            <span className="text-[10px] font-mono text-dark-400">{b.blockCode}</span>
                          </div>
                        </div>

                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                          b.status === 'ACTIVE' 
                            ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' 
                            : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                        }`}>
                          {b.status}
                        </span>
                      </div>

                      <div className="text-[11px] space-y-1 text-dark-300 bg-dark-900/60 p-2 rounded-xl border border-dark-850">
                        <div className="flex justify-between">
                          <span className="text-dark-500">कैमरा चैनल:</span>
                          <span className="font-semibold text-white">कैमरा {b.cameraChannel}</span>
                        </div>
                        {b.barcode && (
                          <div className="flex justify-between">
                            <span className="text-dark-500">बारकोड:</span>
                            <span className="font-mono text-white text-[10px]">{b.barcode}</span>
                          </div>
                        )}
                        {b.category === 'SHELF' && (
                          <div className="flex justify-between">
                            <span className="text-dark-500">पिक काउंट:</span>
                            <span className="font-bold text-sky-400">{b.shelfConfig?.pickCount || b.totalPicks || 0} बार</span>
                          </div>
                        )}
                        {b.category === 'REUSABLE_CAN' && (
                          <div className="flex justify-between">
                            <span className="text-dark-500">गेट स्टेटस:</span>
                            <span className={`font-bold ${b.gateStatus?.status === 'OUTSIDE_SHOP' ? 'text-amber-400' : 'text-emerald-400'}`}>
                              {b.gateStatus?.status === 'OUTSIDE_SHOP' ? 'दुकान से बाहर (OUT)' : 'दुकान के अंदर (IN)'}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <button
                          onClick={() => openEditBlock(b)}
                          className="text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold"
                        >
                          संपादित करें
                        </button>
                        <button
                          onClick={() => handleDeleteBlock(b._id)}
                          className="text-dark-500 hover:text-rose-400 p-1 rounded transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: REUSABLE CANS & GATE TRIPWIRE */}
          {activeTab === 'cans' && (
            <div className="space-y-4">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-dark-950/70 border border-dark-800 rounded-2xl p-3.5">
                  <span className="text-[11px] text-dark-400 font-medium">कुल रजिस्टर्ड कैन / टंकी</span>
                  <div className="text-xl font-bold text-white mt-1">
                    {reusableSummary?.summary?.totalCans || 0} कैन
                  </div>
                </div>

                <div className="bg-dark-950/70 border border-dark-800 rounded-2xl p-3.5">
                  <span className="text-[11px] text-emerald-400 font-medium">दुकान के अंदर (IN)</span>
                  <div className="text-xl font-bold text-emerald-400 mt-1">
                    {reusableSummary?.summary?.insideShop || 0} कैन
                  </div>
                </div>

                <div className="bg-dark-950/70 border border-dark-800 rounded-2xl p-3.5">
                  <span className="text-[11px] text-amber-400 font-medium">दुकान से बाहर (OUT)</span>
                  <div className="text-xl font-bold text-amber-400 mt-1">
                    {reusableSummary?.summary?.outsideShop || 0} कैन
                  </div>
                </div>
              </div>

              {reusableSummary?.summary?.missingAlert && (
                <div className="p-3 bg-rose-950/50 border border-rose-800/40 rounded-2xl flex items-center gap-2.5 text-xs text-rose-300">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span className="font-semibold">{reusableSummary.summary.missingAlert}</span>
                </div>
              )}

              {/* Tripwire Visual Simulation */}
              <div className="bg-dark-950/60 border border-dark-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-white flex items-center gap-2">
                    <Camera className="w-4 h-4 text-emerald-400" />
                    कैमरा 4 - गेट ट्रिपवायर लाइन मॉनिटरिंग
                  </span>
                  <span className="text-[10px] text-dark-400">
                    🟢 Green IN | 🔴 Red OUT
                  </span>
                </div>

                <div className="relative bg-dark-900 border border-dark-700/60 rounded-xl h-36 flex flex-col justify-between p-3 overflow-hidden">
                  <div className="w-full border-t-2 border-emerald-500/80 border-dashed flex justify-between text-[10px] text-emerald-400 font-mono">
                    <span>▼ GREEN LINE (दुकान में प्रवेश - IN)</span>
                    <span>AUTO-LOG +1 RETURN</span>
                  </div>

                  <div className="text-center text-[11px] text-dark-400 font-medium">
                    🚶‍♂️ गेट पैसेज ज़ोन (Camera 4 Field of View)
                  </div>

                  <div className="w-full border-b-2 border-rose-500/80 border-dashed flex justify-between text-[10px] text-rose-400 font-mono">
                    <span>▲ RED LINE (दुकान से निकासी - OUT)</span>
                    <span>AUTO-LOG +1 EXIT</span>
                  </div>
                </div>
              </div>

              {/* Cans Table */}
              <div className="space-y-2">
                <h5 className="text-xs font-bold text-white">मिल्क कैन गेट मूवमेंट रजिस्टर</h5>
                <div className="divide-y divide-dark-800 border border-dark-800 rounded-2xl bg-dark-950/60 overflow-hidden text-xs">
                  {blocks.filter(b => b.category === 'REUSABLE_CAN').map((can) => (
                    <div key={can._id} className="p-3 flex items-center justify-between hover:bg-dark-900/50 transition">
                      <div className="flex items-center gap-3">
                        <span 
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: can.color || '#10B981' }}
                        />
                        <div>
                          <div className="font-bold text-white">{can.name}</div>
                          <span className="text-[10px] text-dark-400 font-mono">{can.blockCode}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleRecordGateMovement(can._id, 'OUT')}
                          className="px-2.5 py-1 bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/30 rounded-lg text-[10px] font-semibold transition"
                        >
                          OUT (बाहर गया)
                        </button>
                        <button
                          onClick={() => handleRecordGateMovement(can._id, 'IN')}
                          className="px-2.5 py-1 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300 border border-emerald-500/30 rounded-lg text-[10px] font-semibold transition"
                        >
                          IN (वापस आया)
                        </button>
                      </div>
                    </div>
                  ))}
                  {blocks.filter(b => b.category === 'REUSABLE_CAN').length === 0 && (
                    <div className="p-6 text-center text-dark-500 text-xs">
                      कोई कैन रजिस्टर्ड नहीं है। "विज़ुअल ब्लॉक्स" टैब में जाकर कैटेगरी 'REUSABLE_CAN' चुनें।
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: SHELF PICK COUNTERS */}
          {activeTab === 'shelves' && (
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-bold text-white">शेल्फ-लेवल एक्टिविटी व पिक काउंटर</h4>
                <p className="text-[11px] text-dark-400">
                  हर छोटे आइटम पर बारकोड लगाए बिना शेल्फ से सामान उठाने की गतिविधि ट्रैक करें
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {blocks.filter(b => b.category === 'SHELF').map((shelf) => (
                  <div key={shelf._id} className="bg-dark-950/70 border border-dark-800 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span 
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: shelf.color || '#3B82F6' }}
                        />
                        <h5 className="font-bold text-white text-xs">{shelf.name}</h5>
                      </div>
                      <span className="text-[10px] font-mono text-dark-400">{shelf.blockCode}</span>
                    </div>

                    <div className="bg-dark-900/80 p-3 rounded-xl border border-dark-800/80 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-dark-400">कुल सामान उठाया गया (Picks):</span>
                        <div className="text-2xl font-black text-sky-400 mt-0.5">
                          {shelf.shelfConfig?.pickCount || shelf.totalPicks || 0}
                        </div>
                      </div>

                      <button
                        onClick={() => handleRecordShelfPick(shelf._id)}
                        className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-semibold shadow-md transition"
                      >
                        +1 पिक टेस्ट
                      </button>
                    </div>

                    <p className="text-[10px] text-dark-500">
                      कैमरा {shelf.cameraChannel} पर हाथ की हरकत या आइटम रिमूवल डिटेक्ट होने पर यह काउंटर स्वतः बढ़ता है।
                    </p>
                  </div>
                ))}

                {blocks.filter(b => b.category === 'SHELF').length === 0 && (
                  <div className="col-span-2 text-center py-10 bg-dark-950/40 rounded-2xl border border-dashed border-dark-800 p-6">
                    <Box className="w-8 h-8 text-dark-600 mx-auto mb-2" />
                    <p className="text-xs text-dark-400">कोई शेल्फ ब्लॉक नहीं बना है।</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: SUPER ADMIN TENANT LIMIT CONTROLS */}
          {activeTab === 'admin' && isSuperAdmin && (
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-bold text-amber-400 flex items-center gap-2">
                  <Crown className="w-4 h-4" />
                  सुपर एडमिन - दुकानदार ब्लॉक लिमिट कंट्रोल (Quota Config)
                </h4>
                <p className="text-[11px] text-dark-400">
                  हर एक दुकानदार के लिए फ्री ब्लॉक्स (15) या पेड ब्लॉक्स (60+) कोटा निर्धारित करें
                </p>
              </div>

              {/* Edit Modal / Drawer for Selected Tenant */}
              {selectedTenantToEdit && (
                <div className="p-4 bg-amber-950/30 border border-amber-600/40 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between border-b border-amber-800/50 pb-2">
                    <span className="text-xs font-bold text-amber-300">
                      डेयरी: {selectedTenantToEdit.name} ({selectedTenantToEdit.mobile})
                    </span>
                    <button
                      onClick={() => setSelectedTenantToEdit(null)}
                      className="text-xs text-dark-400 hover:text-white"
                    >
                      रद्द करें
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <label className="text-dark-400 block mb-1">प्लान टियर (Plan Tier)</label>
                      <select
                        value={adminTier}
                        onChange={(e) => {
                          setAdminTier(e.target.value);
                          if (e.target.value === 'PAID') {
                            setAdminLimit(60);
                          } else if (e.target.value === 'FREE') {
                            setAdminLimit(15);
                          }
                        }}
                        className="w-full bg-dark-900 border border-dark-700 rounded-xl px-3 py-2 text-white"
                      >
                        <option value="FREE">FREE TIER (डिफ़ॉल्ट 15 ब्लॉक्स)</option>
                        <option value="PAID">PAID TIER (60+ ब्लॉक्स)</option>
                        <option value="CUSTOM">CUSTOM LIMIT (कस्टम कोटा)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-dark-400 block mb-1">अधिकतम मान्य ब्लॉक्स (Allowed Limit)</label>
                      <input
                        type="number"
                        min="1"
                        max="500"
                        value={adminLimit}
                        onChange={(e) => setAdminLimit(Number(e.target.value))}
                        className="w-full bg-dark-900 border border-dark-700 rounded-xl px-3 py-2 text-white font-bold"
                      />
                    </div>

                    <div>
                      <label className="text-dark-400 block mb-1">फ्री ब्लॉक्स संख्या</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={adminFreeCount}
                        onChange={(e) => setAdminFreeCount(Number(e.target.value))}
                        className="w-full bg-dark-900 border border-dark-700 rounded-xl px-3 py-2 text-white font-bold"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      onClick={handleSaveAdminTenantLimit}
                      disabled={savingAdminLimit}
                      className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-semibold shadow-md flex items-center gap-1.5"
                    >
                      {savingAdminLimit ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                      दुकानदार कोटा अपडेट करें
                    </button>
                  </div>
                </div>
              )}

              {/* Tenants List */}
              {loadingTenants ? (
                <div className="text-center py-6 text-dark-400 text-xs">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-amber-500" />
                  दुकानदार लिस्ट लोड हो रही है...
                </div>
              ) : (
                <div className="divide-y divide-dark-800 border border-dark-800 rounded-2xl bg-dark-950/60 overflow-hidden text-xs">
                  {allTenants.map((t) => (
                    <div key={t.id} className="p-3.5 flex items-center justify-between hover:bg-dark-900/50 transition">
                      <div>
                        <div className="font-bold text-white flex items-center gap-2">
                          <span>{t.name}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                            t.planTier === 'PAID'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          }`}>
                            {t.planTier}
                          </span>
                        </div>
                        <p className="text-[11px] text-dark-400">
                          {t.ownerName} • {t.mobile}
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <span className="text-[10px] text-dark-400 block">ब्लॉक उपयोग / लिमिट</span>
                          <span className="font-bold text-white">
                            {t.usedBlocksCount} / {t.allowedBlocksLimit} ब्लॉक्स
                          </span>
                        </div>

                        <button
                          onClick={() => {
                            setSelectedTenantToEdit(t);
                            setAdminTier(t.planTier || 'FREE');
                            setAdminLimit(t.allowedBlocksLimit || 15);
                            setAdminFreeCount(t.freeBlocksCount || 15);
                          }}
                          className="px-3 py-1.5 bg-dark-800 hover:bg-dark-700 text-white rounded-xl text-xs font-semibold border border-dark-700 transition"
                        >
                          लिमिट बदलें
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>

      </div>
    </div>
  );
};
