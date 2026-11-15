import React, { useState, useEffect } from 'react';
import API from '../../api';
import { 
  Users, UserCheck, Plus, Trash2, Camera, Clock, 
  X, CheckCircle2, AlertTriangle, 
  Upload, Sparkles
} from 'lucide-react';

export interface ShopPersonProfileItem {
  _id: string;
  name: string;
  role: 'OWNER' | 'STAFF' | 'HELPER' | 'CASHIER';
  mobile?: string;
  photoBase64?: string;
  dutyTiming?: {
    start: string;
    end: string;
  };
  customInstructions?: string;
  status: 'ACTIVE' | 'INACTIVE';
  notes?: string;
  lastSeenAt?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onProfilesUpdated?: () => void;
}

export const ShopPersonProfilesModal: React.FC<Props> = ({ isOpen, onClose, onProfilesUpdated }) => {
  const [profiles, setProfiles] = useState<ShopPersonProfileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form State
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formRole, setFormRole] = useState<'OWNER' | 'STAFF' | 'HELPER' | 'CASHIER'>('STAFF');
  const [formMobile, setFormMobile] = useState('');
  const [formStartDuty, setFormStartDuty] = useState('06:00');
  const [formEndDuty, setFormEndDuty] = useState('20:00');
  const [formInstructions, setFormInstructions] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formPhotoBase64, setFormPhotoBase64] = useState<string | null>(null);

  const fetchProfiles = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await API.get('/cameras/profiles');
      setProfiles(res.data?.profiles || []);
    } catch (err: any) {
      setErrorMessage(err.response?.data?.message || 'प्रोफाइल लोड करने में समस्या आई।');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchProfiles();
    }
  }, [isOpen]);

  const resetForm = () => {
    setEditingId(null);
    setFormName('');
    setFormRole('STAFF');
    setFormMobile('');
    setFormStartDuty('06:00');
    setFormEndDuty('20:00');
    setFormInstructions('');
    setFormNotes('');
    setFormPhotoBase64(null);
    setIsAdding(false);
  };

  const handleEdit = (p: ShopPersonProfileItem) => {
    setEditingId(p._id);
    setFormName(p.name);
    setFormRole(p.role);
    setFormMobile(p.mobile || '');
    setFormStartDuty(p.dutyTiming?.start || '06:00');
    setFormEndDuty(p.dutyTiming?.end || '20:00');
    setFormInstructions(p.customInstructions || '');
    setFormNotes(p.notes || '');
    setFormPhotoBase64(p.photoBase64 || null);
    setIsAdding(true);
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setFormPhotoBase64(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setErrorMessage('कृपया व्यक्ति/स्टाफ का नाम दर्ज करें।');
      return;
    }

    setSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const payload = {
        id: editingId || undefined,
        name: formName.trim(),
        role: formRole,
        mobile: formMobile.trim(),
        photoBase64: formPhotoBase64 || undefined,
        dutyTiming: {
          start: formStartDuty,
          end: formEndDuty,
        },
        customInstructions: formInstructions.trim(),
        notes: formNotes.trim(),
        status: 'ACTIVE',
      };

      await API.post('/cameras/profiles', payload);
      setSuccessMessage('प्रोफाइल सफलतापूर्वक सेव हो गई!');
      resetForm();
      fetchProfiles();
      if (onProfilesUpdated) onProfilesUpdated();
    } catch (err: any) {
      setErrorMessage(err.response?.data?.message || 'प्रोफाइल सेव करने में त्रुटि आई।');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`क्या आप वाकई "${name}" की प्रोफाइल हटाना चाहते हैं?`)) return;
    try {
      await API.delete(`/cameras/profiles/${id}`);
      fetchProfiles();
      if (onProfilesUpdated) onProfilesUpdated();
    } catch (err: any) {
      setErrorMessage('प्रोफाइल हटाने में त्रुटि आई।');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="bg-dark-900 border border-dark-700 w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
        
        {/* Modal Header */}
        <div className="p-5 bg-gradient-to-r from-dark-950 via-indigo-950/40 to-dark-950 border-b border-dark-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                <span>मालिक व स्टाफ फोटो पहचान व निर्देश हब</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  AI Face Enrollment
                </span>
              </h2>
              <p className="text-xs text-dark-300">
                मालिक और स्टाफ का पूरा फोटो अपलोड करें ताकि AI कैमरा उन्हें ग्राहकों से अलग पहचान सके और ड्यूटी की जांच करे।
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-dark-800 text-dark-400 hover:text-white hover:bg-dark-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body (Scrollable) */}
        <div className="p-5 overflow-y-auto space-y-6 flex-1">
          
          {/* Alerts */}
          {errorMessage && (
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Top Action Bar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-dark-300">पंजीकृत सदस्य ({profiles.length})</span>
            </div>

            {!isAdding && (
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setIsAdding(true);
                }}
                className="py-2 px-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md transition-all active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>नया सदस्य / स्टाफ जोड़ें</span>
              </button>
            )}
          </div>

          {/* Form for Add / Edit */}
          {isAdding && (
            <form onSubmit={handleSave} className="p-5 rounded-3xl bg-dark-950 border border-indigo-500/40 shadow-xl space-y-4 animate-fade-in">
              <div className="flex items-center justify-between border-b border-dark-800 pb-3">
                <h4 className="text-sm font-black text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-400" />
                  <span>{editingId ? 'प्रोफाइल संपादित करें' : 'नया सदस्य जोड़ें (फोटो व निर्देश)'}</span>
                </h4>
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-xs text-dark-400 hover:text-white"
                >
                  रद्द करें
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
                
                {/* Left: Photo Upload (4 Cols) */}
                <div className="md:col-span-4 space-y-3 flex flex-col items-center">
                  <label className="text-xs font-bold text-dark-300 self-start">चेहरे का स्पष्ट फोटो:</label>
                  
                  <div className="relative w-36 h-44 rounded-2xl overflow-hidden bg-dark-900 border-2 border-dashed border-dark-700 flex items-center justify-center group shadow-inner">
                    {formPhotoBase64 ? (
                      <img
                        src={formPhotoBase64}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="text-center p-3 space-y-1">
                        <Camera className="w-8 h-8 text-dark-500 mx-auto" />
                        <span className="text-[10px] text-dark-400 block">फोटो नहीं चुनी</span>
                      </div>
                    )}

                    <label className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center cursor-pointer text-white text-[11px] font-bold p-2 text-center">
                      <Upload className="w-5 h-5 mb-1" />
                      <span>फोटो बदलें</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handlePhotoUpload}
                        className="hidden"
                      />
                    </label>
                  </div>

                  <label className="cursor-pointer py-1.5 px-3 rounded-xl bg-dark-800 hover:bg-dark-700 text-dark-200 text-xs font-semibold flex items-center gap-1.5 border border-dark-700 transition-colors">
                    <Upload className="w-3.5 h-3.5 text-indigo-400" />
                    <span>फोटो अपलोड करें</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* Right: Info Fields (8 Cols) */}
                <div className="md:col-span-8 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-dark-300">नाम *</label>
                      <input
                        type="text"
                        value={formName}
                        onChange={(e) => setFormName(e.target.value)}
                        placeholder="उदा: आकाश (काउंटर स्टाफ)"
                        required
                        className="w-full mt-1 p-2.5 rounded-xl bg-dark-900 border border-dark-800 text-xs text-white placeholder-dark-500 focus:outline-none focus:border-indigo-500 font-medium"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-dark-300">पद / भूमिका *</label>
                      <select
                        value={formRole}
                        onChange={(e: any) => setFormRole(e.target.value)}
                        className="w-full mt-1 p-2.5 rounded-xl bg-dark-900 border border-dark-800 text-xs text-white focus:outline-none focus:border-indigo-500 font-medium"
                      >
                        <option value="STAFF">दुकान स्टाफ (Staff)</option>
                        <option value="OWNER">मालिक (Owner)</option>
                        <option value="CASHIER">कैशियर / गल्ला प्रभारी (Cashier)</option>
                        <option value="HELPER">हेल्पर / सहायक (Helper)</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-bold text-dark-300">मोबाइल नंबर</label>
                      <input
                        type="tel"
                        value={formMobile}
                        onChange={(e) => setFormMobile(e.target.value)}
                        placeholder="10 अंक मोबाइल"
                        className="w-full mt-1 p-2.5 rounded-xl bg-dark-900 border border-dark-800 text-xs text-white placeholder-dark-500 focus:outline-none focus:border-indigo-500 font-medium"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-dark-300">ड्यूटी शुरू (समय)</label>
                      <input
                        type="time"
                        value={formStartDuty}
                        onChange={(e) => setFormStartDuty(e.target.value)}
                        className="w-full mt-1 p-2 rounded-xl bg-dark-900 border border-dark-800 text-xs text-white focus:outline-none focus:border-indigo-500 font-medium"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-dark-300">ड्यूटी समाप्त (समय)</label>
                      <input
                        type="time"
                        value={formEndDuty}
                        onChange={(e) => setFormEndDuty(e.target.value)}
                        className="w-full mt-1 p-2 rounded-xl bg-dark-900 border border-dark-800 text-xs text-white focus:outline-none focus:border-indigo-500 font-medium"
                      />
                    </div>
                  </div>

                  {/* Custom Instructions for AI */}
                  <div>
                    <label className="text-xs font-bold text-dark-300 flex items-center justify-between">
                      <span>मालिक के विशेष निर्देश (AI इसी के आधार पर जांचेगा):</span>
                      <span className="text-[10px] text-indigo-400 font-normal">AI Watcher Prompt</span>
                    </label>
                    <textarea
                      rows={2}
                      value={formInstructions}
                      onChange={(e) => setFormInstructions(e.target.value)}
                      placeholder="उदा: काउंटर छोड़कर नहीं जाना, गल्ला बिना मालिक के नहीं खोलना, ग्राहकों से सम्मानपूर्वक बात करना..."
                      className="w-full mt-1 p-2.5 rounded-xl bg-dark-900 border border-dark-800 text-xs text-white placeholder-dark-500 focus:outline-none focus:border-indigo-500 leading-relaxed font-sans"
                    />
                  </div>
                </div>

              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-dark-800">
                <button
                  type="button"
                  onClick={resetForm}
                  className="py-2 px-4 rounded-xl bg-dark-900 hover:bg-dark-800 text-dark-300 text-xs font-bold transition-colors"
                >
                  रद्द करें
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="py-2 px-5 rounded-xl bg-gradient-to-r from-emerald-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 text-white text-xs font-extrabold shadow-lg transition-all disabled:opacity-50"
                >
                  {saving ? 'सेव हो रहा है...' : editingId ? 'अपडेट करें' : 'सहेजें व AI में जोड़ें'}
                </button>
              </div>
            </form>
          )}

          {/* Profiles Cards Grid */}
          {loading ? (
            <div className="p-8 text-center text-dark-400 text-xs font-bold">प्रोफाइल लोड हो रही हैं...</div>
          ) : profiles.length === 0 ? (
            <div className="p-8 rounded-3xl bg-dark-950 border border-dark-800 text-center space-y-3">
              <UserCheck className="w-12 h-12 text-dark-600 mx-auto" />
              <h4 className="text-sm font-bold text-white">कोई स्टाफ या मालिक प्रोफाइल पंजीकृत नहीं है</h4>
              <p className="text-xs text-dark-400 max-w-md mx-auto">
                अपना और अपने दुकान के लड़कों/नौकरों का फोटो और नाम जोड़ें ताकि AI वीडियो में उन्हें सही पहचान सके।
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {profiles.map((p) => (
                <div
                  key={p._id}
                  className="p-4 rounded-3xl bg-dark-950 border border-dark-800 hover:border-indigo-500/40 shadow-lg space-y-3 transition-all flex flex-col justify-between"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-14 h-16 rounded-2xl overflow-hidden bg-dark-900 border border-dark-800 shrink-0 flex items-center justify-center">
                      {p.photoBase64 ? (
                        <img src={p.photoBase64} alt={p.name} className="w-full h-full object-cover" />
                      ) : (
                        <UserCheck className="w-6 h-6 text-dark-500" />
                      )}
                    </div>

                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-bold text-white">{p.name}</h4>
                        <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold border ${
                          p.role === 'OWNER' 
                            ? 'bg-amber-500/10 text-amber-300 border-amber-500/30' 
                            : 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30'
                        }`}>
                          {p.role === 'OWNER' ? '👑 मालिक' : p.role === 'CASHIER' ? '💰 कैशियर' : '🧑‍💼 स्टाफ'}
                        </span>
                      </div>

                      {p.mobile && (
                        <p className="text-[11px] text-dark-400 font-mono">मो: {p.mobile}</p>
                      )}

                      <p className="text-[10px] text-dark-400 flex items-center gap-1 font-mono">
                        <Clock className="w-3 h-3 text-dark-500" />
                        <span>{p.dutyTiming?.start || '06:00'} - {p.dutyTiming?.end || '20:00'}</span>
                      </p>
                    </div>
                  </div>

                  {p.customInstructions && (
                    <div className="p-2.5 rounded-xl bg-dark-900 border border-dark-800 text-[11px] text-dark-300 leading-snug">
                      <span className="text-indigo-400 font-bold block text-[10px] uppercase">मालिक के निर्देश:</span>
                      <p className="line-clamp-2 mt-0.5">{p.customInstructions}</p>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1 border-t border-dark-800 text-xs">
                    <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-bold">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span>सक्रिय (AI Active)</span>
                    </span>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleEdit(p)}
                        className="px-2 py-1 rounded-lg bg-dark-800 hover:bg-dark-700 text-dark-300 hover:text-white text-[11px] font-semibold"
                      >
                        एडिट
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(p._id, p.name)}
                        className="p-1 rounded-lg text-dark-400 hover:text-rose-400 hover:bg-dark-800"
                        title="हटाएं"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-dark-950 border-t border-dark-800 flex items-center justify-between shrink-0">
          <p className="text-xs text-dark-400">
            💡 AI लाइव वॉचर और CCTV वीडियो स्कैन इन प्रोफाइल के आधार पर स्टाफ का स्कोर निकालेगा।
          </p>
          <button
            onClick={onClose}
            className="py-2 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md"
          >
            पूर्ण (Done)
          </button>
        </div>

      </div>
    </div>
  );
};
