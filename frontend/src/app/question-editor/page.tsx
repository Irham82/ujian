'use client';

import React, { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import { apiRequest } from '@/lib/api-client';

export default function QuestionEditorPage() {
  const [banks, setBanks] = useState<any[]>([]);
  const [bankId, setBankId] = useState('');
  const [questionType, setQuestionType] = useState<
    'SINGLE_CHOICE' | 'MULTIPLE_CHOICE_COMPLEX' | 'TRUE_FALSE' | 'SHORT_ANSWER' | 'ESSAY'
  >('SINGLE_CHOICE');
  const [status, setStatus] = useState<'DRAFT' | 'REVIEW' | 'PUBLISHED'>('PUBLISHED');
  const [difficulty, setDifficulty] = useState<'EASY' | 'MEDIUM' | 'HARD'>('MEDIUM');
  const [category, setCategory] = useState('PENALARAN KUANTITATIF');
  const [defaultWeight, setDefaultWeight] = useState(20);
  const [stemHtml, setStemHtml] = useState('');
  const [formulaLatex, setFormulaLatex] = useState('');
  const [explanationHtml, setExplanationHtml] = useState('');
  const [singleCorrectKey, setSingleCorrectKey] = useState('A');
  const [complexCorrectKeys, setComplexCorrectKeys] = useState<string[]>(['A', 'C']);
  const [trueFalseKey, setTrueFalseKey] = useState<'TRUE' | 'FALSE'>('TRUE');
  const [shortAcceptedAnswers, setShortAcceptedAnswers] = useState('42, empat puluh dua');
  const [essayRubric, setEssayRubric] = useState('');
  const [options, setOptions] = useState([
    { optionKey: 'A', contentHtml: 'Pilihan Jawaban A' },
    { optionKey: 'B', contentHtml: 'Pilihan Jawaban B' },
    { optionKey: 'C', contentHtml: 'Pilihan Jawaban C' },
    { optionKey: 'D', contentHtml: 'Pilihan Jawaban D' },
    { optionKey: 'E', contentHtml: 'Pilihan Jawaban E' },
  ]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    apiRequest('/question-banks')
      .then((res) => {
        if (Array.isArray(res) && res.length > 0) {
          setBanks(res);
          setBankId(res[0].id);
        }
      })
      .catch(() => {});
  }, []);

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bankId) return;

    let answerKey: Record<string, any> = {};
    let formattedOptions: any[] = [];

    if (questionType === 'SINGLE_CHOICE') {
      answerKey = { selectedOption: singleCorrectKey };
      formattedOptions = options.map((o, i) => ({
        optionKey: o.optionKey,
        contentHtml: o.contentHtml,
        isCorrect: o.optionKey === singleCorrectKey,
        sortOrder: i + 1,
      }));
    } else if (questionType === 'MULTIPLE_CHOICE_COMPLEX') {
      answerKey = { selectedOptions: complexCorrectKeys };
      formattedOptions = options.map((o, i) => ({
        optionKey: o.optionKey,
        contentHtml: o.contentHtml,
        isCorrect: complexCorrectKeys.includes(o.optionKey),
        sortOrder: i + 1,
      }));
    } else if (questionType === 'TRUE_FALSE') {
      answerKey = { selectedOption: trueFalseKey, value: trueFalseKey === 'TRUE' };
      formattedOptions = [
        { optionKey: 'TRUE', contentHtml: 'Benar', isCorrect: trueFalseKey === 'TRUE', sortOrder: 1 },
        { optionKey: 'FALSE', contentHtml: 'Salah', isCorrect: trueFalseKey === 'FALSE', sortOrder: 2 },
      ];
    } else if (questionType === 'SHORT_ANSWER') {
      answerKey = {
        acceptedAnswers: shortAcceptedAnswers
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      };
    } else if (questionType === 'ESSAY') {
      answerKey = { rubric: essayRubric };
    }

    try {
      const created = await apiRequest(`/question-banks/${bankId}/questions`, {
        method: 'POST',
        body: {
          questionType,
          status,
          difficulty,
          category,
          defaultWeight: Number(defaultWeight),
          stemHtml,
          formulaLatex: formulaLatex || undefined,
          answerKey,
          explanationHtml,
          options: formattedOptions,
        },
      });
      setMessage(
        `Butir soal berhasil disimpan ke Bank Soal (ID: ${created.id}, Versi: ${created.version}).`,
      );
      setStemHtml('');
      setFormulaLatex('');
      setExplanationHtml('');
    } catch (err: any) {
      setMessage(err.message);
    }
  };

  return (
    <AppShell
      title="Editor Butir Soal (5 Tipe Soal TKA)"
      subtitle="Buat soal Pilihan Ganda, PG Kompleks, Benar-Salah, Isian Singkat, dan Esai beserta kunci jawaban, rumus, bobot, dan pembahasan"
    >
      <form
        onSubmit={handleSaveQuestion}
        className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5"
      >
        {message && (
          <div className="p-3.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 text-sm font-medium">
            {message}
          </div>
        )}

        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Bank Soal Tujuan</label>
            <select
              value={bankId}
              onChange={(e) => setBankId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
            >
              {banks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Jenis Soal</label>
            <select
              value={questionType}
              onChange={(e) => setQuestionType(e.target.value as any)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-semibold"
            >
              <option value="SINGLE_CHOICE">1. Pilihan Ganda (1 Jawaban Benar)</option>
              <option value="MULTIPLE_CHOICE_COMPLEX">2. Pilihan Ganda Kompleks (Multi-Jawaban)</option>
              <option value="TRUE_FALSE">3. Benar / Salah</option>
              <option value="SHORT_ANSWER">4. Isian Singkat (Koreksi Otomatis)</option>
              <option value="ESSAY">5. Esai / Uraian (Koreksi Manual Guru)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Status Publikasi & Bobot
            </label>
            <div className="flex gap-2">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-sm"
              >
                <option value="DRAFT">DRAFT</option>
                <option value="REVIEW">REVIEW</option>
                <option value="PUBLISHED">PUBLISHED</option>
              </select>
              <input
                type="number"
                value={defaultWeight}
                onChange={(e) => setDefaultWeight(Number(e.target.value))}
                className="w-24 px-3 py-2 rounded-lg border border-slate-300 text-sm"
                title="Bobot Nilai"
              />
            </div>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Kategori / Kompetensi</label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Tingkat Kesulitan</label>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as any)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
            >
              <option value="EASY">EASY (Mudah)</option>
              <option value="MEDIUM">MEDIUM (Sedang)</option>
              <option value="HARD">HARD (Sukar / HOTS)</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Naskah Pokok Soal (Mendukung HTML, Tabel & Stimulus TKA)
          </label>
          <textarea
            rows={4}
            required
            value={stemHtml}
            onChange={(e) => setStemHtml(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
            placeholder="<p>Tuliskan stimulus wacana, tabel, atau pertanyaan di sini...</p>"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Rumus Matematika / Fisika (LaTeX Opsional)
          </label>
          <input
            type="text"
            value={formulaLatex}
            onChange={(e) => setFormulaLatex(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono"
            placeholder="Mis: f(x) = \int_{0}^{2} (3x^2 + 2x) dx"
          />
        </div>

        {/* Pengaturan Kunci Jawaban Berdasarkan Jenis Soal */}
        {(questionType === 'SINGLE_CHOICE' || questionType === 'MULTIPLE_CHOICE_COMPLEX') && (
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <h3 className="text-sm font-bold text-slate-900">
              Opsi Jawaban & Kunci Jawaban (Disimpan di Server, Tidak Pernah Dikirim ke API Siswa)
            </h3>
            {options.map((opt, idx) => (
              <div key={opt.optionKey} className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-blue-900 text-white font-bold text-xs flex items-center justify-center shrink-0">
                  {opt.optionKey}
                </span>
                <input
                  type="text"
                  value={opt.contentHtml}
                  onChange={(e) => {
                    const next = [...options];
                    next[idx] = { ...opt, contentHtml: e.target.value };
                    setOptions(next);
                  }}
                  className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                />
                {questionType === 'SINGLE_CHOICE' ? (
                  <label className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                    <input
                      type="radio"
                      name="singleKey"
                      checked={singleCorrectKey === opt.optionKey}
                      onChange={() => setSingleCorrectKey(opt.optionKey)}
                    />
                    Kunci Benar
                  </label>
                ) : (
                  <label className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                    <input
                      type="checkbox"
                      checked={complexCorrectKeys.includes(opt.optionKey)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setComplexCorrectKeys([...complexCorrectKeys, opt.optionKey]);
                        } else {
                          setComplexCorrectKeys(
                            complexCorrectKeys.filter((k) => k !== opt.optionKey),
                          );
                        }
                      }}
                    />
                    Kunci Benar
                  </label>
                )}
              </div>
            ))}
          </div>
        )}

        {questionType === 'TRUE_FALSE' && (
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <label className="block text-xs font-bold text-slate-800 mb-2">
              Kunci Jawaban Benar / Salah:
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input
                  type="radio"
                  checked={trueFalseKey === 'TRUE'}
                  onChange={() => setTrueFalseKey('TRUE')}
                />
                BENAR (TRUE)
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input
                  type="radio"
                  checked={trueFalseKey === 'FALSE'}
                  onChange={() => setTrueFalseKey('FALSE')}
                />
                SALAH (FALSE)
              </label>
            </div>
          </div>
        )}

        {questionType === 'SHORT_ANSWER' && (
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <label className="block text-xs font-bold text-slate-800 mb-1">
              Daftar Variasi Jawaban Singkat yang Diterima (Pisahkan dengan koma):
            </label>
            <input
              type="text"
              value={shortAcceptedAnswers}
              onChange={(e) => setShortAcceptedAnswers(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
            />
          </div>
        )}

        {questionType === 'ESSAY' && (
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <label className="block text-xs font-bold text-slate-800 mb-1">
              Rubrik Penilaian Manual Guru (Pedoman Penskoran Esai):
            </label>
            <textarea
              rows={3}
              value={essayRubric}
              onChange={(e) => setEssayRubric(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
              placeholder="Tuliskan kriteria penilaian esai untuk pegangan Guru saat koreksi manual..."
            />
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Pembahasan Soal (Hanya untuk Guru/Admin & Evaluasi Pasca-Ujian)
          </label>
          <textarea
            rows={2}
            value={explanationHtml}
            onChange={(e) => setExplanationHtml(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
          />
        </div>

        <button
          type="submit"
          className="px-6 py-3 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-bold text-sm"
        >
          Simpan Butir Soal ke Bank Soal
        </button>
      </form>
    </AppShell>
  );
}
