import { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { CheckCircle, UploadCloud } from 'lucide-react';
import { API } from '../utils/api';

const inputClass = 'w-full rounded-md border border-[#9bb4ad] bg-white px-3 py-2.5 text-sm text-[#173b35] placeholder:text-[#a4bbb4] focus:border-[#1d6b5d]';
const labelClass = 'mb-1 block text-xs font-semibold text-[#52736a]';
const getInitialFormState = (user) => ({
  voter_name: '', father_name: '', date_of_birth: '', mobile_number: '', email: '', gender: '', voter_id: '',
  citizenship_status: true, nationality: 'Indian', application_type: 'new',
  region: user?.assigned_region || '', constituency: user?.assigned_constituency || '', mandal: '', village: '',
  degree_qualification: '', university: '', college: '', course: '', graduation_year: '',
  form18_number: '', acknowledgement_number: '', reference_number: '', notes: '',
  complete_address: '', district: '', state: 'Telangana', pincode: '', degree_certificate_url: ''
});

export default function EnrollmentForm({ coordinatorId, onSubmitted }) {
  const { user } = useAuth();
  const initialFormState = getInitialFormState(user);
  const [formData, setFormData] = useState(() => {
    try { return { ...initialFormState, ...JSON.parse(localStorage.getItem(`enrollment-draft-${user?.id}`) || '{}') }; }
    catch { return initialFormState; }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [submittedId, setSubmittedId] = useState(null);
  const [file, setFile] = useState(null);
  const [regions, setRegions] = useState([]);
  const [assemblies, setAssemblies] = useState([]);
  const [mandals, setMandals] = useState([]);
  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    if (user?.id) localStorage.setItem(`enrollment-draft-${user.id}`, JSON.stringify(formData));
  }, [formData, user?.id]);

  useEffect(() => {
    axios.get(`${API}/geo/regions`)
      .then(response => setRegions(response.data || []))
      .catch(() => setError('Failed to load regions.'));
  }, []);

  useEffect(() => {
    setAssemblies([]);
    setMandals([]);
    setFormData(current => ({ ...current, constituency: user?.assigned_constituency || '', mandal: '' }));
    if (!formData.region) return;
    axios.get(`${API}/geo/assemblies`, { params: { region: formData.region } })
      .then(response => setAssemblies(response.data || []))
      .catch(() => setError('Failed to load assembly constituencies.'));
  }, [formData.region, user?.assigned_constituency]);

  useEffect(() => {
    setMandals([]);
    setFormData(current => ({ ...current, mandal: '' }));
    if (!formData.constituency) return;
    axios.get(`${API}/geo/mandals`, { params: { constituency: formData.constituency } })
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
    setFieldErrors(current => ({ ...current, [name]: validateField(name, value) }));
  };

  const handleBlur = (e) => setFieldErrors(current => ({ ...current, [e.target.name]: validateField(e.target.name, formData[e.target.name]) }));

  const validateField = (name, value) => {
    const required = ['voter_id', 'voter_name', 'date_of_birth', 'mobile_number', 'email', 'gender', 'university', 'college', 'course', 'degree_qualification', 'graduation_year', 'region', 'constituency', 'mandal', 'complete_address', 'village', 'district', 'pincode'];
    if (required.includes(name) && !String(value || '').trim()) return 'This field is required.';
    if (name === 'mobile_number' && value && !/^\d{10}$/.test(value)) return 'Mobile number must be exactly 10 digits.';
    if (name === 'email' && value && !/^\S+@\S+\.\S+$/.test(value)) return 'Enter a valid personal email.';
    if (name === 'graduation_year' && value && (Number(value) < 1900 || Number(value) > 2023)) return 'Graduation year must be between 1900 and 2023.';
    if (name === 'pincode' && value && !/^\d{6}$/.test(value)) return 'Pincode must be exactly 6 digits.';
    if (name === 'date_of_birth' && value && calculateAge(value) < 18) return 'Voter must be at least 18 years old.';
    return '';
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
    const nextErrors = Object.keys(formData).reduce((errors, name) => ({ ...errors, [name]: validateField(name, formData[name]) }), {});
    setFieldErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return setError('Please correct the highlighted fields.');
    if (!formData.acknowledgement_number) return setError('Acknowledgement number is required.');
    if (Number(formData.graduation_year) > 2023) return setError('Year of graduation must be 2023 or earlier.');
    if (!formData.degree_certificate_url) return setError('Please upload the degree certificate.');
    if (!formData.form18_number && !formData.acknowledgement_number && !formData.reference_number) return setError('Enter Form 18, acknowledgement, or reference number.');

    setLoading(true);
    try {
      const response = await axios.post(`${API}/voters/enroll`, { ...formData, coordinator_id: coordinatorId || user.id });
      setSubmittedId(response.data.voter?.id);
      setSuccess(true);
      setFormData(initialFormState);
      localStorage.removeItem(`enrollment-draft-${user.id}`);
      setFieldErrors({});
      setFile(null);
      onSubmitted?.();
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
          <div className="grid gap-3 sm:grid-cols-2"><Field label="Voter ID *" name="voter_id" value={formData.voter_id} onChange={handleChange} onBlur={handleBlur} error={fieldErrors.voter_id} placeholder="Enter voter ID" /><Field label="Gender *" name="gender" value={formData.gender} onChange={handleChange} onBlur={handleBlur} error={fieldErrors.gender} as="select"><option value="">Select gender</option><option>Female</option><option>Male</option><option>Other</option></Field></div>
          <div className="grid gap-3 sm:grid-cols-2"><div><label className={labelClass}>Full name *</label><input name="voter_name" required value={formData.voter_name} onChange={handleChange} className={inputClass} placeholder="Enter full name" /></div><div><label className={labelClass}>Father's name/Husband's name</label><input name="father_name" value={formData.father_name} onChange={handleChange} className={inputClass} placeholder="Enter father's name" /></div></div>
          <div className="grid gap-3 sm:grid-cols-3"><div><label className={labelClass}>Date of birth *</label><input type="date" name="date_of_birth" required value={formData.date_of_birth} onChange={handleChange} onBlur={handleBlur} className={`${inputClass} ${fieldErrors.date_of_birth ? 'border-[#c45d52] bg-[#fff8f7]' : ''}`} />{fieldErrors.date_of_birth && <p className="mt-1 text-xs font-medium text-[#b44d45]" role="alert">{fieldErrors.date_of_birth}</p>}</div><div><label className={labelClass}>Age</label><input disabled value={calculateAge(formData.date_of_birth)} className={`${inputClass} bg-[#edf3f0]`} placeholder="Auto-calculated" /></div><Field label="Mobile number *" name="mobile_number" type="tel" value={formData.mobile_number} onChange={handleChange} onBlur={handleBlur} error={fieldErrors.mobile_number} placeholder="10-digit number" /></div>
          <Field label="Personal email *" name="email" type="email" value={formData.email} onChange={handleChange} onBlur={handleBlur} error={fieldErrors.email} placeholder="name@example.com" />
          <div><label className={labelClass}>Nationality *</label><input value="Indian" readOnly className={`${inputClass} bg-[#edf3f0]`} /><input type="hidden" name="nationality" value="Indian" /></div>
        </section>

        <section className="space-y-3 rounded-lg border border-[#e4ebe7] bg-[#f7faf8] p-4"><h3 className="border-b border-[#e4ebe7] pb-2 text-sm font-bold uppercase tracking-wider text-[#52736a]">Application and education</h3>
          <div><label className={labelClass}>Application type *</label><div className="flex gap-5 pt-1"><label className="flex items-center gap-2 text-sm text-[#465b55]"><input type="radio" name="application_type" value="new" checked={formData.application_type === 'new'} onChange={handleChange} /> New</label><label className="flex items-center gap-2 text-sm text-[#465b55]"><input type="radio" name="application_type" value="renewal" checked={formData.application_type === 'renewal'} onChange={handleChange} /> Renewal</label></div></div>
          <div className="grid gap-3 sm:grid-cols-2"><Field label="University *" name="university" value={formData.university} onChange={handleChange} onBlur={handleBlur} error={fieldErrors.university} placeholder="Enter university" /><Field label="College *" name="college" value={formData.college} onChange={handleChange} onBlur={handleBlur} error={fieldErrors.college} placeholder="Enter college" /></div>
          <Field label="Course *" name="course" value={formData.course} onChange={handleChange} onBlur={handleBlur} error={fieldErrors.course} placeholder="Enter course" />
          <div className="grid gap-3 sm:grid-cols-2"><Field label="Degree qualification *" name="degree_qualification" value={formData.degree_qualification} onChange={handleChange} onBlur={handleBlur} error={fieldErrors.degree_qualification} placeholder="e.g. B.Tech" /><Field label="Year of graduation * (2023 or earlier)" name="graduation_year" type="number" value={formData.graduation_year} onChange={handleChange} onBlur={handleBlur} error={fieldErrors.graduation_year} placeholder="YYYY" /></div>
          <div className="grid gap-3 sm:grid-cols-2"><div><label className={labelClass}>Acknowledgement number *</label><input name="acknowledgement_number" required value={formData.acknowledgement_number} onChange={handleChange} className={inputClass} /></div><div><label className={labelClass}>Notes <span className="font-normal text-[#849890]">(optional)</span></label><input name="notes" value={formData.notes} onChange={handleChange} className={inputClass} placeholder="Add a note if needed" /></div></div>
        </section>

        <section className="space-y-3 rounded-lg border border-[#e4ebe7] bg-[#f7faf8] p-4"><h3 className="border-b border-[#e4ebe7] pb-2 text-sm font-bold uppercase tracking-wider text-[#52736a]">Address and constituency</h3>
          <div className="grid gap-3 sm:grid-cols-2"><Field label="Region *" name="region" value={formData.region} onChange={handleChange} onBlur={handleBlur} error={fieldErrors.region} as="select" disabled={Boolean(user?.assigned_region)}><option value="">Select region</option>{regions.map(item => <option key={item.region} value={item.region}>{item.region}</option>)}</Field><Field label="Assembly constituency *" name="constituency" value={formData.constituency} onChange={handleChange} onBlur={handleBlur} error={fieldErrors.constituency} as="select" disabled={Boolean(user?.assigned_constituency)}><option value="">Select constituency</option>{assemblies.map(item => <option key={`${item.ac_no}-${item.assembly_constituency}`} value={item.assembly_constituency}>{item.assembly_constituency}</option>)}</Field></div>
          <div><label className={labelClass}>Mandal *</label><select name="mandal" required value={formData.mandal} onChange={handleChange} disabled={!formData.constituency} className={inputClass}><option value="">Select mandal</option>{mandals.map(item => <option key={item.mandal} value={item.mandal}>{item.mandal}</option>)}</select></div>
          <Field label="Complete address *" name="complete_address" value={formData.complete_address} onChange={handleChange} onBlur={handleBlur} error={fieldErrors.complete_address} placeholder="H.No, STREET, city, district" />
          <div className="grid gap-3 sm:grid-cols-2"><Field label="Village / Ward *" name="village" value={formData.village} onChange={handleChange} onBlur={handleBlur} error={fieldErrors.village} placeholder="Enter village or ward" /><Field label="District *" name="district" value={formData.district} onChange={handleChange} onBlur={handleBlur} error={fieldErrors.district} placeholder="Enter district" /></div>
          <div className="grid gap-3 sm:grid-cols-2"><Field label="State *" name="state" value={formData.state} onChange={handleChange} onBlur={handleBlur} error={fieldErrors.state} readOnly /><Field label="Pincode *" name="pincode" value={formData.pincode} onChange={handleChange} onBlur={handleBlur} error={fieldErrors.pincode} placeholder="6-digit pincode" /></div>
        </section>

        <section className="space-y-3 rounded-lg border border-[#e4ebe7] bg-[#f7faf8] p-4"><h3 className="border-b border-[#e4ebe7] pb-2 text-sm font-bold uppercase tracking-wider text-[#52736a]">Supporting document</h3><label className={labelClass}>Degree certificate *</label><div className="relative rounded-md border-2 border-dashed border-[#b6cbc3] bg-white p-5 text-center hover:bg-[#f2f8f4]"><input type="file" onChange={handleFileChange} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" accept=".pdf,.jpg,.jpeg,.png" /><UploadCloud className="mx-auto mb-2 text-[#1d6b5d]" size={24} /><span className="text-sm font-medium text-[#465b55]">{file ? file.name : 'Tap to upload document'}</span><p className="mt-1 text-xs text-[#849890]">PDF, JPG or PNG up to 5MB</p></div></section>
        <button type="submit" disabled={loading} className="w-full rounded-md bg-[#173b35] px-4 py-3 font-bold text-white shadow-sm transition hover:bg-[#28584e] disabled:opacity-60">{loading ? <span className="mx-auto block h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" /> : 'Submit enrollment'}</button>
      </form>
    </div>
  );
}

function Field({ label, name, value, onChange, onBlur, error, as = 'input', children, ...props }) {
  const Control = as;
  return <div>
    <label className={labelClass}>{label}</label>
    <Control name={name} value={value} onChange={onChange} onBlur={onBlur} className={`${inputClass} ${error ? 'border-[#c45d52] bg-[#fff8f7]' : ''}`} {...props}>{children}</Control>
    {error && <p className="mt-1 text-xs font-medium text-[#b44d45]" role="alert">{error}</p>}
  </div>;
}
