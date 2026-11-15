import React, { useState, useEffect, useCallback } from 'react';
import API from '../../api';
import { 
  Calendar, FileText, Printer, Share2, Search, 
  RefreshCw, TrendingUp, ChevronDown, ChevronUp
} from 'lucide-react';
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, 
  Tooltip, Legend, CartesianGrid 
} from 'recharts';

interface MilkEntryItem {
  _id: string;
  date: string;
  dateStr: string;
  shift: 'Morning' | 'Evening';
  milkType: string;
  quantity: number;
  fat: number;
  snf: number;
  rate: number;
  amount: number;
}

interface FarmerSheetItem {
  farmerId: string;
  _id: string;
  name: string;
  mobile: string;
  village: string;
  entriesCount: number;
  entries: MilkEntryItem[];
  totalMorningQty: number;
  totalEveningQty: number;
  totalQty: number;
  avgFat: number;
  avgSnf: number;
  totalMilkValue: number;
  advancesDeducted: number;
  netPayable: number;
  whatsappText: string;
}

export const FarmerCycleBillingSheet: React.FC = () => {
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1); // 1-12
  const [selectedDecade, setSelectedDecade] = useState<number>(now.getDate() <= 10 ? 1 : now.getDate() <= 20 ? 2 : 3);
  const [cycleType] = useState<string>('10_DAY');

  const [loading, setLoading] = useState<boolean>(false);
  const [periodLabel, setPeriodLabel] = useState<string>('');
  const [totals, setTotals] = useState<any>({
    totalFarmers: 0,
    totalCycleMilk: 0,
    totalCyclePayout: 0,
    totalAdvances: 0,
    totalNetPayable: 0,
    averageFatOverall: 0,
  });
  const [dailyTrend, setDailyTrend] = useState<any[]>([]);
  const [farmerSheets, setFarmerSheets] = useState<FarmerSheetItem[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedFarmerId, setExpandedFarmerId] = useState<string | null>(null);

  // Thermal Print Modal
  const [printSlip, setPrintSlip] = useState<FarmerSheetItem | null>(null);

  const fetchCycleData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get('/payments/settlement-cycle-sheet', {
        params: {
          cycleType,
          year: selectedYear,
          month: selectedMonth,
          decadeIndex: selectedDecade
        }
      });

      if (res.data?.success) {
        setPeriodLabel(res.data.periodLabel || '');
        setTotals(res.data.totals || {});
        setDailyTrend(res.data.dailyTrend || []);
        setFarmerSheets(res.data.farmerSheets || []);
      }
    } catch (err) {
      console.error('Failed to load settlement cycle sheet', err);
    } finally {
      setLoading(false);
    }
  }, [cycleType, selectedYear, selectedMonth, selectedDecade]);

  useEffect(() => {
    fetchCycleData();
  }, [fetchCycleData]);

  const handleShareWhatsApp = (sheet: FarmerSheetItem) => {
    const text = encodeURIComponent(sheet.whatsappText);
    const mobileClean = sheet.mobile ? sheet.mobile.replace(/\D/g, '') : '';
    const url = mobileClean.length === 10
      ? `https://wa.me/91${mobileClean}?text=${text}`
      : `https://wa.me/?text=${text}`;
    window.open(url, '_blank');
  };

  const handlePrintSlip = (sheet: FarmerSheetItem) => {
    setPrintSlip(sheet);
    setTimeout(() => {
      window.print();
    }, 300);
  };

  const filteredFarmers = farmerSheets.filter(f => 
    f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.farmerId.includes(searchQuery) ||
    f.mobile.includes(searchQuery) ||
    (f.village && f.village.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* Top Controls & Decade Selector */}
      <div className="p-5 rounded-3xl bg-gradient-to-r from-dark-900 via-indigo-950/40 to-dark-900 border border-indigo-900/40 shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-bold border border-indigo-500/30">
              <Calendar className="w-3.5 h-3.5" />
              <span>10-दिवसीय बिलिंग व भुगतान शीट (10-Day Cycle Ledger)</span>
            </div>
            <h2 className="text-xl md:text-2xl font-black text-white mt-1">
              किसान दूध भुगतान व खाता निपटान (10-Day Billing)
            </h2>
            <p className="text-xs text-dark-300">
              {periodLabel || '10-दिवसीय चक्र के अनुसार संकलन, औसत फैट, एडवांस कटौती व WhatsApp पर्ची'}
            </p>
          </div>

          <button
            onClick={fetchCycleData}
            disabled={loading}
            className="px-4 py-2 rounded-2xl bg-dark-950 border border-dark-800 text-xs font-bold text-dark-200 hover:text-white flex items-center gap-2 transition-all shadow-md active:scale-95 shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-indigo-400' : ''}`} />
            <span>शीट रिफ्रेश करें</span>
          </button>
        </div>

        {/* Decade Selector Buttons (1-10, 11-20, 21-End) */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-dark-800">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-dark-400">दशक चुनें:</span>
            <div className="flex items-center gap-1.5 bg-dark-950 p-1.5 rounded-2xl border border-dark-800">
              {[
                { dec: 1, label: 'दशक १ (1 - 10)' },
                { dec: 2, label: 'दशक २ (11 - 20)' },
                { dec: 3, label: 'दशक ३ (21 - अंत)' },
              ].map((d) => (
                <button
                  key={d.dec}
                  onClick={() => setSelectedDecade(d.dec)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    selectedDecade === d.dec
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'text-dark-400 hover:text-white'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Month & Year pickers */}
          <div className="flex items-center gap-2">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="px-3 py-1.5 rounded-xl bg-dark-950 border border-dark-800 text-xs text-white focus:outline-none"
            >
              {[
                'जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून',
                'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'
              ].map((mName, idx) => (
                <option key={idx + 1} value={idx + 1}>{mName}</option>
              ))}
            </select>

            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="px-3 py-1.5 rounded-xl bg-dark-950 border border-dark-800 text-xs text-white focus:outline-none"
            >
              {[2025, 2026, 2027].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        {/* KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <div className="p-3.5 rounded-2xl bg-dark-950/80 border border-dark-800">
            <span className="text-[10px] text-dark-400 font-bold uppercase block">कुल दूध संकलन</span>
            <p className="text-lg font-black text-white mt-0.5">{totals.totalCycleMilk} L</p>
            <p className="text-[10px] text-dark-400 mt-0.5">{totals.totalFarmers} किसानों द्वारा</p>
          </div>

          <div className="p-3.5 rounded-2xl bg-dark-950/80 border border-dark-800">
            <span className="text-[10px] text-dark-400 font-bold uppercase block">औसत फैट (Avg FAT)</span>
            <p className="text-lg font-black text-emerald-400 mt-0.5">{totals.averageFatOverall}%</p>
            <p className="text-[10px] text-dark-400 mt-0.5">वेटेड एवरेज</p>
          </div>

          <div className="p-3.5 rounded-2xl bg-dark-950/80 border border-dark-800">
            <span className="text-[10px] text-dark-400 font-bold uppercase block">काटा गया एडवांस</span>
            <p className="text-lg font-black text-rose-400 mt-0.5">₹{totals.totalAdvances?.toLocaleString('en-IN')}</p>
            <p className="text-[10px] text-dark-400 mt-0.5">कुल कटौती</p>
          </div>

          <div className="p-3.5 rounded-2xl bg-dark-950/80 border border-dark-800">
            <span className="text-[10px] text-dark-400 font-bold uppercase block">कुल शुद्ध भुगतान देय</span>
            <p className="text-lg font-black text-indigo-400 mt-0.5">₹{totals.totalNetPayable?.toLocaleString('en-IN')}</p>
            <p className="text-[10px] text-dark-400 mt-0.5">Net Payable Amount</p>
          </div>
        </div>
      </div>

      {/* Dynamic 10-Day Daily Chart */}
      {dailyTrend.length > 0 && (
        <div className="p-5 rounded-3xl bg-dark-900 border border-dark-800 shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-indigo-400" />
              <span>10-दिवसीय दैनिक दूध व भुगतान ग्राफ (Daily Yield & Amount)</span>
            </h3>
            <span className="text-[10px] text-dark-400 font-mono">Decade Trend</span>
          </div>

          <div className="h-56 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={(d) => d.split('-')[2]} 
                  stroke="#737373" 
                  tick={{ fontSize: 10 }}
                />
                <YAxis stroke="#737373" tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0a0a0a', borderColor: '#262626', borderRadius: '1rem', fontSize: '11px' }}
                  labelFormatter={(d) => `तारीख: ${d}`}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                <Bar dataKey="morningQty" name="सुबह (L)" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                <Bar dataKey="eveningQty" name="शाम (L)" fill="#06b6d4" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Search Bar */}
      <div className="p-4 rounded-2xl bg-dark-900 border border-dark-800 flex items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-dark-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="किसान का नाम, कोड (#), मोबाइल या गाँव खोजें..."
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-dark-950 border border-dark-800 text-xs text-white placeholder-dark-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
        <span className="text-xs font-bold text-dark-400 shrink-0">
          कुल किसान: {filteredFarmers.length}
        </span>
      </div>

      {/* Farmer Sheets List */}
      {loading ? (
        <div className="p-16 text-center space-y-3 rounded-3xl bg-dark-900 border border-dark-800">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-dark-300">10-दिवसीय बिलिंग शीट लोड हो रही है...</p>
        </div>
      ) : filteredFarmers.length === 0 ? (
        <div className="p-16 text-center space-y-2 rounded-3xl bg-dark-900 border border-dark-800">
          <FileText className="w-10 h-10 text-dark-600 mx-auto" />
          <h4 className="text-sm font-bold text-white">इस दशक में कोई दूध एंट्री नहीं मिली</h4>
          <p className="text-xs text-dark-400">कृपया तारीख व दशक की जांच करें या दूध संकलन दर्ज करें।</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredFarmers.map((farmer) => {
            const isExpanded = expandedFarmerId === farmer.farmerId;
            return (
              <div
                key={farmer.farmerId}
                className="rounded-3xl bg-dark-900 border border-dark-800 hover:border-indigo-500/40 transition-all p-4 shadow-sm space-y-3"
              >
                {/* Farmer Main Summary Row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 text-indigo-300 font-black flex items-center justify-center text-xs">
                      #{farmer.farmerId}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-black text-white">{farmer.name}</h4>
                        {farmer.village && (
                          <span className="text-[10px] text-dark-400 px-1.5 py-0.5 rounded bg-dark-950 border border-dark-800">
                            {farmer.village}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-dark-400 font-mono">{farmer.mobile || 'मोबाइल उपलब्ध नहीं'}</p>
                    </div>
                  </div>

                  {/* Summary Metric Badges */}
                  <div className="grid grid-cols-4 gap-2 text-center text-xs">
                    <div className="p-2 rounded-xl bg-dark-950 border border-dark-800/80">
                      <span className="text-[9px] text-dark-400 block">कुल दूध</span>
                      <span className="text-xs font-black text-white">{farmer.totalQty} L</span>
                    </div>

                    <div className="p-2 rounded-xl bg-dark-950 border border-dark-800/80">
                      <span className="text-[9px] text-dark-400 block">औसत FAT</span>
                      <span className="text-xs font-black text-emerald-400">{farmer.avgFat}%</span>
                    </div>

                    <div className="p-2 rounded-xl bg-dark-950 border border-dark-800/80">
                      <span className="text-[9px] text-dark-400 block">एडवांस</span>
                      <span className="text-xs font-black text-rose-400">₹{farmer.advancesDeducted}</span>
                    </div>

                    <div className="p-2 rounded-xl bg-indigo-950/40 border border-indigo-500/30">
                      <span className="text-[9px] text-indigo-300 block font-bold">शुद्ध देय</span>
                      <span className="text-xs font-black text-indigo-200">₹{farmer.netPayable.toLocaleString('en-IN')}</span>
                    </div>
                  </div>

                  {/* Action Buttons: WhatsApp & Print */}
                  <div className="flex items-center gap-1.5 self-end sm:self-auto">
                    <button
                      type="button"
                      onClick={() => handleShareWhatsApp(farmer)}
                      className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-md active:scale-95"
                      title="WhatsApp पर बिल पर्ची भेजें"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      <span>WhatsApp बिल</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handlePrintSlip(farmer)}
                      className="p-2 rounded-xl bg-dark-950 hover:bg-dark-800 text-dark-300 hover:text-white border border-dark-800 transition-all"
                      title="पर्ची प्रिंट करें"
                    >
                      <Printer className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => setExpandedFarmerId(isExpanded ? null : farmer.farmerId)}
                      className="p-2 rounded-xl bg-dark-950 hover:bg-dark-800 text-dark-300 hover:text-white border border-dark-800 transition-all"
                      title="दैनिक विवरण देखें"
                    >
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Expanded Daily Details Table */}
                {isExpanded && (
                  <div className="pt-2 border-t border-dark-800 space-y-2 animate-fade-in">
                    <span className="text-[10px] font-bold uppercase text-dark-400">
                      दैनिक दूध संकलन विवरण ({farmer.entries.length} एंट्रीज़):
                    </span>

                    <div className="overflow-x-auto rounded-2xl border border-dark-800 bg-dark-950">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-dark-900 border-b border-dark-800 text-[10px] text-dark-400 uppercase">
                          <tr>
                            <th className="p-2.5">तारीख</th>
                            <th className="p-2.5">शिफ्ट</th>
                            <th className="p-2.5">दूध</th>
                            <th className="p-2.5">मात्रा (L)</th>
                            <th className="p-2.5">FAT %</th>
                            <th className="p-2.5">SNF %</th>
                            <th className="p-2.5">भाव (₹/L)</th>
                            <th className="p-2.5 text-right">कुल राशि (₹)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-dark-800/60 font-mono text-dark-300">
                          {farmer.entries.map((entry, idx) => (
                            <tr key={idx} className="hover:bg-dark-900/40">
                              <td className="p-2.5 text-white">{entry.dateStr}</td>
                              <td className="p-2.5">
                                <span className={`px-1.5 py-0.2 rounded text-[10px] ${entry.shift === 'Morning' ? 'text-amber-400' : 'text-blue-400'}`}>
                                  {entry.shift === 'Morning' ? '☀️ सुबह' : '🌙 शाम'}
                                </span>
                              </td>
                              <td className="p-2.5">{entry.milkType}</td>
                              <td className="p-2.5 text-white font-bold">{entry.quantity}</td>
                              <td className="p-2.5 text-emerald-400">{entry.fat}</td>
                              <td className="p-2.5">{entry.snf || '--'}</td>
                              <td className="p-2.5">₹{entry.rate}</td>
                              <td className="p-2.5 text-right font-black text-white">₹{entry.amount}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Printable Thermal Receipt (Hidden on Screen, Visible on Print) */}
      {printSlip && (
        <div className="hidden print:block fixed inset-0 bg-white text-black p-4 font-mono text-xs z-50">
          <div className="text-center border-b border-black pb-2 mb-2">
            <h2 className="text-base font-black">श्री कृष्णा डेयरी</h2>
            <p className="text-[10px]">10-दिवसीय किसान दूध बिल पर्ची</p>
            <p className="text-[10px]">अवधि: {periodLabel}</p>
          </div>

          <div className="space-y-1 text-[11px] mb-2 border-b border-black pb-2">
            <p><strong>किसान:</strong> {printSlip.name} [#{printSlip.farmerId}]</p>
            <p><strong>मोबाइल:</strong> {printSlip.mobile}</p>
            <p><strong>गाँव:</strong> {printSlip.village || '--'}</p>
          </div>

          <div className="border-b border-black pb-2 mb-2 space-y-1">
            <div className="flex justify-between">
              <span>सुबह दूध:</span>
              <span>{printSlip.totalMorningQty} L</span>
            </div>
            <div className="flex justify-between">
              <span>शाम दूध:</span>
              <span>{printSlip.totalEveningQty} L</span>
            </div>
            <div className="flex justify-between font-bold">
              <span>कुल दूध:</span>
              <span>{printSlip.totalQty} L</span>
            </div>
            <div className="flex justify-between">
              <span>औसत FAT:</span>
              <span>{printSlip.avgFat}%</span>
            </div>
            <div className="flex justify-between">
              <span>औसत SNF:</span>
              <span>{printSlip.avgSnf}%</span>
            </div>
          </div>

          <div className="space-y-1.5 font-bold text-sm">
            <div className="flex justify-between">
              <span>दूध मूल्य:</span>
              <span>₹{printSlip.totalMilkValue.toLocaleString('en-IN')}</span>
            </div>
            <div className="flex justify-between text-red-600">
              <span>एडवांस कटौती:</span>
              <span>-₹{printSlip.advancesDeducted.toLocaleString('en-IN')}</span>
            </div>
            <div className="flex justify-between text-base border-t border-black pt-1">
              <span>शुद्ध भुगतान:</span>
              <span>₹{printSlip.netPayable.toLocaleString('en-IN')}</span>
            </div>
          </div>

          <p className="text-center text-[10px] mt-4 border-t border-black pt-2">
            धन्यवाद! श्री कृष्णा डेयरी
          </p>
        </div>
      )}

    </div>
  );
};

