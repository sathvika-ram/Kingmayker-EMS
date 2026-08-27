import { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { CheckCircle, UploadCloud } from 'lucide-react';

const inputClass = 'w-full rounded-md border border-[#9bb4ad] bg-white px-3 py-2.5 text-sm text-[#173b35] placeholder:text-[#a4bbb4] focus:border-[#1d6b5d]';
const labelClass = 'mb-1 block text-xs font-semibold text-[#52736a]';

export default function EnrollmentForm() {
  const { user } = useAuth();
  const initialFormState = {
    voter_name: '', father_name: '', date_of_birth: '', mobile_number: '', email: '', gender: '', voter_id: '',
    citizenship_status: true, nationality: 'Indian', application_type: 'new',
    region: user?.assigned_constituency || '', constituency: '', mandal: '', village: '',
    degree_qualification: '', university: '', college: '', course: '', graduation_year: '',
    form18_number: '', acknowledgement_number: '', reference_number: '', notes: '',
    complete_address: '', district: '', state: 'Telangana', pincode: '', degree_certificate_url: ''
  };
  const [formData, setFormData] = useState(initialFormState);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [submittedId, setSubmittedId] = useState(null);
  const [file, setFile] = useState(null);
  const [regions, setRegions] = useState([]);
  const [assemblies, setAssemblies] = useState([]);
  const [mandals, setMandals] = useState([]);

  useEffect(() => {
    axios.get('http://localhost:5000/api/geo/regions')
      .then(response => setRegions(response.data || []))
      .catch(() => setError('Failed to load regions.'));
  }, []);

  useEffect(() => {
    setAssemblies([]);
    setMandals([]);
    setFormData(current => ({ ...current, constituency: '', mandal: '' }));
    if (!formData.region) return;
    axios.get('http://localhost:5000/api/geo/assemblies', { params: { region: formData.region } })
      .then(response => setAssemblies(response.data || []))
      .catch(() => setError('Failed to load assembly constituencies.'));
  }, [formData.region]);

  useEffect(() => {
    setMandals([]);
    setFormData(current => ({ ...current, mandal: '' }));
    if (!formData.constituency) return;
    axios.get('http://localhost:5000/api/geo/mandals', { params: { constituency: formData.constituency } })
      .then(response => setMandals(response.data || []))
      .catch(() => setError('Failed to load mandals.'));
  }, [formData.constituency]);

  const calculateAge = (dob) => {
    if (!dob) return '';
    return Math.floor((Date.now() - new Date(dob).getTime()) / 31557600000);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(current => ({ ...current, [name]: value }));
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setFormData(current => ({ ...current, degree_certificate_url: `https://storage.mock.local/${selectedFile.name}` }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (calculateAge(formData.date_of_birth) < 18) return setError('Voter must be at least 18 years old.');
    if (!formData.voter_id) return setError('Voter ID is required.');
    if (!formData.mobile_number) return setError('Mobile number is required.');
    if (!formData.acknowledgement_number) return setError('Acknowledgement number is required.');
    if (Number(formData.graduation_year) > 2023) return setError('Year of graduation must be 2023 or earlier.');
    if (!formData.degree_certificate_url) return setError('Please upload the degree certificate.');
    if (!formData.form18_number && !formData.acknowledgement_number && !formData.reference_number) return setError('Enter Form 18, acknowledgement, or reference number.');

    setLoading(true);
    try {
      const response = await axios.post('http://localhost:5000/api/voters/enroll', { ...formData, coordinator_id: user.id });
      setSubmittedId(response.data.voter?.id);
      setSuccess(true);
      setFormData(initialFormState);
      setFile(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit enrollment');
    } finally {
      setLoading(false);
    }
  };

  if (success) return (
    <div className="flex h-full flex-col items-center justify-center space-y-4 p-8 text-center">
      <CheckCircle className="h-16 w-16 text-[#2f7c57]" />
      <h2 className="text-2xl font-bold text-[#173b35]">Enrollment Submitted</h2>
      <p className="text-sm font-semibold text-[#1d6b5d]">Application No: {submittedId}</p>
      <p className="text-sm text-[#64736f]">The enrollment is in progress and ready for status review.</p>
      <button onClick={() => setSuccess(false)} className="mt-4 rounded-md bg-[#173b35] px-6 py-2.5 font-medium text-white hover:bg-[#28584e]">Submit another</button>
    </div>
  );

  return (
    <div className="mx-auto w-full p-4 sm:p-6 lg:p-8">
      <div className="mb-5 flex items-start justify-between">
        <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#7b9b3a]">Coordinator workspace</p><h2 className="mt-1 text-2xl font-bold text-[#173b35]">New enrollment</h2><p className="mt-1 text-sm text-[#64736f]">Enter the voter details carefully. Fields marked * are required.</p></div>
        <span className="rounded-full bg-[#e8f4ef] px-3 py-1 text-xs font-semibold text-[#1d6b5d]">Step 1 of 1</span>
      </div>
      {error && <div className="mb-4 rounded-md border border-[#f0c8c2] bg-[#fff3f1] p-3 text-sm text-[#a84b43]">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-4 pb-8">
        <section className="space-y-3 rounded-lg border border-[#e4ebe7] bg-[#f7faf8] p-4"><h3 className="border-b border-[#e4ebe7] pb-2 text-sm font-bold uppercase tracking-wider text-[#52736a]">Personal details</h3>
          <div className="grid gap-3 sm:grid-cols-2"><div><label className={labelClass}>Voter ID *</label><input name="voter_id" required value={formData.voter_id} onChange={handleChange} className={inputClass} placeholder="Enter voter ID" /></div><div><label className={labelClass}>Gender</label><select name="gender" value={formData.gender} onChange={handleChange} className={inputClass}><option value="">Select gender</option><option>Female</option><option>Male</option><option>Other</option></select></div></div>
          <div className="grid gap-3 sm:grid-cols-2"><div><label className={labelClass}>Full name *</label><input name="voter_name" required value={formData.voter_name} onChange={handleChange} className={inputClass} placeholder="Enter full name" /></div><div><label className={labelClass}>Father's name/Husband's name</label><input name="father_name" value={formData.father_name} onChange={handleChange} className={inputClass} placeholder="Enter father's name" /></div></div>
          <div className="grid gap-3 sm:grid-cols-3"><div><label className={labelClass}>Date of birth *</label><input type="date" name="date_of_birth" required value={formData.date_of_birth} onChange={handleChange} className={inputClass} /></div><div><label className={labelClass}>Age</label><input disabled value={calculateAge(formData.date_of_birth)} className={`${inputClass} bg-[#edf3f0]`} placeholder="Auto-calculated" /></div><div><label className={labelClass}>Mobile number *</label><input type="tel" name="mobile_number" required pattern="[0-9]{10}" value={formData.mobile_number} onChange={handleChange} className={inputClass} placeholder="10-digit number" /></div></div>
          <div><label className={labelClass}>Email address <span className="font-normal text-[#849890]">(optional)</span></label><input type="email" name="email" value={formData.email} onChange={handleChange} className={inputClass} placeholder="name@example.com" /></div>
          <div><label className={labelClass}>Nationality *</label><input value="Indian" readOnly className={`${inputClass} bg-[#edf3f0]`} /><input type="hidden" name="nationality" value="Indian" /></div>
        </section>

        <section className="space-y-3 rounded-lg border border-[#e4ebe7] bg-[#f7faf8] p-4"><h3 className="border-b border-[#e4ebe7] pb-2 text-sm font-bold uppercase tracking-wider text-[#52736a]">Application and education</h3>
          <div><label className={labelClass}>Application type *</label><div className="flex gap-5 pt-1"><label className="flex items-center gap-2 text-sm text-[#465b55]"><input type="radio" name="application_type" value="new" checked={formData.application_type === 'new'} onChange={handleChange} /> New</label><label className="flex items-center gap-2 text-sm text-[#465b55]"><input type="radio" name="application_type" value="renewal" checked={formData.application_type === 'renewal'} onChange={handleChange} /> Renewal</label></div></div>
          <div className="grid gap-3 sm:grid-cols-2"><div><label className={labelClass}>University</label><input name="university" value={formData.university} onChange={handleChange} className={inputClass} placeholder="Enter university" /></div><div><label className={labelClass}>College</label><input name="college" value={formData.college} onChange={handleChange} className={inputClass} placeholder="Enter college" /></div></div>
          <div><label className={labelClass}>Course</label><input name="course" value={formData.course} onChange={handleChange} className={inputClass} placeholder="Enter course" /></div>
          <div className="grid gap-3 sm:grid-cols-2"><div><label className={labelClass}>Degree qualification</label><input name="degree_qualification" value={formData.degree_qualification} onChange={handleChange} className={inputClass} placeholder="e.g. B.Tech" /></div><div><label className={labelClass}>Year of graduation * <span className="font-normal text-[#849890]">(2023 or earlier)</span></label><input type="number" name="graduation_year" required min="1900" max="2023" value={formData.graduation_year} onChange={handleChange} className={inputClass} placeholder="YYYY" /></div></div>
          <div className="grid gap-3 sm:grid-cols-2"><div><label className={labelClass}>Acknowledgement number *</label><input name="acknowledgement_number" required value={formData.acknowledgement_number} onChange={handleChange} className={inputClass} /></div><div><label className={labelClass}>Notes <span className="font-normal text-[#849890]">(optional)</span></label><input name="notes" value={formData.notes} onChange={handleChange} className={inputClass} placeholder="Add a note if needed" /></div></div>
        </section>

        <section className="space-y-3 rounded-lg border border-[#e4ebe7] bg-[#f7faf8] p-4"><h3 className="border-b border-[#e4ebe7] pb-2 text-sm font-bold uppercase tracking-wider text-[#52736a]">Address and constituency</h3>
          <div className="grid gap-3 sm:grid-cols-2"><div><label className={labelClass}>Region *</label><select name="region" required value={formData.region} onChange={handleChange} className={inputClass}><option value="">Select region</option>{regions.map(item => <option key={item.region} value={item.region}>{item.region}</option>)}</select></div><div><label className={labelClass}>Assembly constituency *</label><select name="constituency" required value={formData.constituency} onChange={handleChange} disabled={!formData.region} className={inputClass}><option value="">Select constituency</option>{assemblies.map(item => <option key={`${item.ac_no}-${item.assembly_constituency}`} value={item.assembly_constituency}>{item.assembly_constituency}</option>)}</select></div></div>
          <div><label className={labelClass}>Mandal *</label><select name="mandal" required value={formData.mandal} onChange={handleChange} disabled={!formData.constituency} className={inputClass}><option value="">Select mandal</option>{mandals.map(item => <option key={item.mandal} value={item.mandal}>{item.mandal}</option>)}</select></div>
          <div><label className={labelClass}>Complete address *</label><input name="complete_address" required value={formData.complete_address} onChange={handleChange} className={inputClass} placeholder="House number, street and locality" /></div>
          <div className="grid gap-3 sm:grid-cols-2"><div><label className={labelClass}>Village / city *</label><input name="village" required value={formData.village} onChange={handleChange} className={inputClass} /></div><div><label className={labelClass}>District *</label><input name="district" required value={formData.district} onChange={handleChange} className={inputClass} /></div></div>
          <div className="grid gap-3 sm:grid-cols-2"><div><label className={labelClass}>State *</label><input name="state" required value={formData.state} onChange={handleChange} className={inputClass} /></div><div><label className={labelClass}>Pincode *</label><input name="pincode" required inputMode="numeric" pattern="[0-9]{6}" value={formData.pincode} onChange={handleChange} className={inputClass} placeholder="6-digit pincode" /></div></div>
        </section>

        <section className="space-y-3 rounded-lg border border-[#e4ebe7] bg-[#f7faf8] p-4"><h3 className="border-b border-[#e4ebe7] pb-2 text-sm font-bold uppercase tracking-wider text-[#52736a]">Supporting document</h3><label className={labelClass}>Degree certificate *</label><div className="relative rounded-md border-2 border-dashed border-[#b6cbc3] bg-white p-5 text-center hover:bg-[#f2f8f4]"><input type="file" onChange={handleFileChange} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" accept=".pdf,.jpg,.jpeg,.png" /><UploadCloud className="mx-auto mb-2 text-[#1d6b5d]" size={24} /><span className="text-sm font-medium text-[#465b55]">{file ? file.name : 'Tap to upload document'}</span><p className="mt-1 text-xs text-[#849890]">PDF, JPG or PNG up to 5MB</p></div></section>
        <button type="submit" disabled={loading} className="w-full rounded-md bg-[#173b35] px-4 py-3 font-bold text-white shadow-sm transition hover:bg-[#28584e] disabled:opacity-60">{loading ? <span className="mx-auto block h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" /> : 'Submit enrollment'}</button>
      </form>
    </div>
  );
}
