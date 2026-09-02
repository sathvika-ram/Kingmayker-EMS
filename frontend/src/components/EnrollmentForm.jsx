import { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { CheckCircle, UploadCloud } from 'lucide-react';
import { API } from '../utils/api';

const inputClass = 'w-full rounded-md border border-[#9bb4ad] bg-white px-3 py-2.5 text-sm text-[#173b35] placeholder:text-[#a4bbb4] focus:border-[#1d6b5d]';
const labelClass = 'mb-1 block text-xs font-semibold text-[#52736a]';
const requiredStar = <span className="text-red-600">*</span>;
const isFullAccessAgent = (user) => user?.role === 'constituency_coordinator' && (user?.assigned_region === 'All' || user?.assigned_constituency === 'All' || !user?.assigned_region || !user?.assigned_constituency);
const getInitialFormState = (user) => ({
  voter_name: '', father_name: '', date_of_birth: '', mobile_number: '', email: '', gender: '', voter_id: '',
  citizenship_status: true, nationality: 'Indian',
  region: user?.assigned_region && user.assigned_region !== 'All' ? user.assigned_region : '', constituency: user?.assigned_constituency && user.assigned_constituency !== 'All' ? user.assigned_constituency : '', booth_number: '', mandal: '', village: '',
  degree_qualification: '', graduation_year: '',
  form18_number: '', acknowledgement_number: '', reference_number: '', notes: '',
  complete_address: '', district: '', state: 'Telangana', pincode: '', degree_certificate_url: '', degree_certificate_urls: []
});

export default function EnrollmentForm({ coordinatorId, onSubmitted }) {
  const { user } = useAuth();
  const fullAccessAgent = isFullAccessAgent(user);
  const initialFormState = getInitialFormState(user);
  const [formData, setFormData] = useState(() => {
    try { return { ...initialFormState, ...JSON.parse(localStorage.getItem(`enrollment-draft-${user?.id}`) || '{}') }; }
    catch { return initialFormState; }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [submittedId, setSubmittedId] = useState(null);
  const [files, setFiles] = useState([]);
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
    if (!fullAccessAgent) {
      setFormData(current => ({ ...current, constituency: user?.assigned_constituency && user.assigned_constituency !== 'All' ? user.assigned_constituency : '', mandal: '' }));
    } else {
      setFormData(current => ({ ...current, constituency: '', mandal: '' }));
    }
    if (!formData.region) return;
    axios.get(`${API}/geo/assemblies`, { params: { region: formData.region } })
      .then(response => setAssemblies(response.data || []))
      .catch(() => setError('Failed to load assembly constituencies.'));
  }, [formData.region, user?.assigned_constituency, fullAccessAgent]);

  useEffect(() => {
    const normalizedConstituency = String(formData.constituency || '').trim();
    setMandals([]);
    setFormData(current => ({ ...current, mandal: '' }));
    if (!normalizedConstituency) return;
    axios.get(`${API}/geo/mandals`, { params: { constituency: normalizedConstituency } })
      .then(response => setMandals(Array.isArray(response.data) ? response.data.map(item => typeof item === 'string' ? { mandal: item } : item) : []))
      .catch(() => setError('Failed to load mandals.'));
  }, [formData.constituency]);

  const calculateAge = (dob) => {
    if (!dob) return '';
    const birthDate = new Date(dob);
    if (Number.isNaN(birthDate.getTime())) return '';
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age -= 1;
    return age;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(current => ({ ...current, [name]: value }));
    setFieldErrors(current => ({ ...current, [name]: validateField(name, value) }));
  };

  const handleBlur = (e) => setFieldErrors(current => ({ ...current, [e.target.name]: validateField(e.target.name, formData[e.target.name]) }));

  const getGraduationEligibilityError = (graduationYear, dateOfBirth) => {
    if (!graduationYear || !dateOfBirth) return '';
    const year = Number(graduationYear);
    const birthYear = new Date(dateOfBirth).getFullYear();
    if (Number.isNaN(birthYear)) return '';
    if (year > 2023) return 'Only graduates who passed out before November 2023 are eligible.';
    if (year - birthYear < 20) return 'Invalid age';
    return '';
  };

  const validateField = (name, value) => {
    const required = ['voter_id', 'voter_name', 'father_name', 'date_of_birth', 'mobile_number', 'gender', 'degree_qualification', 'graduation_year', 'acknowledgement_number', 'region', 'constituency', 'booth_number', 'mandal', 'complete_address', 'village', 'district', 'pincode'];
    if (required.includes(name) && !String(value || '').trim()) return 'This field is required.';
    if (name === 'mobile_number' && value && !/^\d{10}$/.test(value)) return 'Mobile number must be exactly 10 digits.';
    if (name === 'email' && value && !/^\S+@\S+\.\S+$/.test(value)) return 'Enter a valid personal email.';
    if (name === 'graduation_year' && value && (Number(value) < 1900 || Number(value) > 2023)) return 'Only graduates who passed out before November 2023 are eligible.';
    if (name === 'pincode' && value && !/^\d{6}$/.test(value)) return 'Pincode must be exactly 6 digits.';
    if (name === 'date_of_birth' && value && calculateAge(value) < 20) return 'Voter must be at least 20 years old.';
    if (name === 'graduation_year' && value && formData.date_of_birth) {
      const birthYear = new Date(formData.date_of_birth).getFullYear();
      if (!Number.isNaN(birthYear) && Number(value) - birthYear < 20) return 'Invalid age';
    }
    if (name === 'date_of_birth' && value && formData.graduation_year) {
      const birthYear = new Date(value).getFullYear();
      if (!Number.isNaN(birthYear) && Number(formData.graduation_year) - birthYear < 20) return 'Invalid age';
    }
    return '';
  };

  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length > 2) {
      setError('You can upload a maximum of two supporting documents.');
      e.target.value = '';
      return;
    }
    setFiles(selectedFiles);
    setFormData(current => ({ ...current, degree_certificate_url: '', degree_certificate_urls: [] }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const nextErrors = Object.keys(formData).reduce((errors, name) => ({ ...errors, [name]: validateField(name, formData[name]) }), {});
    setFieldErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return setError('Please correct the highlighted fields.');
    if (!formData.acknowledgement_number) return setError('Acknowledgement number is required.');
    if (formData.graduation_year && Number(formData.graduation_year) > 2023) return setError('Only graduates who passed out before November 2023 are eligible.');
    if (formData.graduation_year && formData.date_of_birth) {
      const birthYear = new Date(formData.date_of_birth).getFullYear();
      if (!Number.isNaN(birthYear) && Number(formData.graduation_year) - birthYear < 20) return setError('Invalid age');
    }
    if (!files.length && !formData.degree_certificate_urls?.length && !formData.degree_certificate_url) {
      // Document storage can be unavailable in some deployments. Keep the enrollment submission usable
      // while allowing the admin to attach documents later if the storage backend is restored.
    }
    if (!formData.form18_number && !formData.acknowledgement_number && !formData.reference_number) return setError('Enter Form 18, acknowledgement, or reference number.');

    setLoading(true);
    try {
      const enrollmentData = { ...formData, coordinator_id: coordinatorId || user.id };
      delete enrollmentData.application_type;
      if (files.length) {
        const uploadData = new FormData();
        files.forEach(selectedFile => uploadData.append('files', selectedFile));
        try {
          const uploadResponse = await axios.post(`${API}/uploads`, uploadData);
          enrollmentData.degree_certificate_url = uploadResponse.data.urls?.[0] || '';
          enrollmentData.degree_certificate_urls = uploadResponse.data.urls || [];
        } catch (uploadError) {
          console.warn('Document upload unavailable; continuing without uploaded file urls.', uploadError);
          enrollmentData.degree_certificate_url = '';
          enrollmentData.degree_certificate_urls = [];
        }
      }
      const response = await axios.post(`${API}/voters/enroll`, enrollmentData);
      setSubmittedId(response.data.voter?.id);
      setSuccess(true);
      setFormData(initialFormState);
      localStorage.removeItem(`enrollment-draft-${user.id}`);
      setFieldErrors({});
      setFiles([]);
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
      <div className="mb-5 flex flex-col items-center justify-center text-center">
        <h2 className="text-2xl font-bold text-[#173b35]">New enrollment</h2>
        <p className="mt-1 text-sm text-[#64736f]">Enter the voter details carefully. Fields marked <span className="text-red-600">*</span> are required.</p>
      </div>
      {error && <div className="mb-4 rounded-md border border-[#f0c8c2] bg-[#fff3f1] p-3 text-sm text-[#a84b43]">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-4 pb-8">
        <section className="space-y-3 rounded-lg border border-[#e4ebe7] bg-[#f7faf8] p-4"><h3 className="border-b border-[#e4ebe7] pb-2 text-sm font-bold uppercase tracking-wider text-[#52736a]">Personal details</h3>
          <div className="grid gap-3 sm:grid-cols-2"><Field label={<><span>Voter ID</span>{requiredStar}</>} name="voter_id" value={formData.voter_id} onChange={handleChange} onBlur={handleBlur} error={fieldErrors.voter_id} placeholder="Enter voter ID" /><Field label={<><span>Gender</span>{requiredStar}</>} name="gender" value={formData.gender} onChange={handleChange} onBlur={handleBlur} error={fieldErrors.gender} as="select"><option value="">Select gender</option><option>Female</option><option>Male</option><option>Other</option></Field></div>
          <div className="grid gap-3 sm:grid-cols-2"><div><label className={labelClass}><span>Full name</span>{requiredStar}</label><input name="voter_name" required value={formData.voter_name} onChange={handleChange} className={inputClass} placeholder="Enter full name" /></div><div><label className={labelClass}><span>Father's name/Husband's name</span>{requiredStar}</label><input name="father_name" required value={formData.father_name} onChange={handleChange} onBlur={handleBlur} className={`${inputClass} ${fieldErrors.father_name ? 'border-[#c45d52] bg-[#fff8f7]' : ''}`} placeholder="Enter father's or husband's name" />{fieldErrors.father_name && <p className="mt-1 text-xs font-medium text-[#b44d45]" role="alert">{fieldErrors.father_name}</p>}</div></div>
          <div className="grid gap-3 sm:grid-cols-3"><div><label className={labelClass}><span>Date of birth</span>{requiredStar}</label><input type="date" name="date_of_birth" required value={formData.date_of_birth} onChange={handleChange} onBlur={handleBlur} className={`${inputClass} ${fieldErrors.date_of_birth ? 'border-[#c45d52] bg-[#fff8f7]' : ''}`} />{fieldErrors.date_of_birth && <p className="mt-1 text-xs font-medium text-[#b44d45]" role="alert">{fieldErrors.date_of_birth}</p>}</div><div><label className={labelClass}>Age</label><input readOnly value={calculateAge(formData.date_of_birth)} className={`${inputClass} bg-[#edf3f0]`} placeholder="Auto-calculated" />{formData.date_of_birth && formData.graduation_year && getGraduationEligibilityError(formData.graduation_year, formData.date_of_birth) === 'Invalid age' && <p className="mt-1 text-xs font-medium text-[#b44d45]" role="alert">Invalid age</p>}</div><Field label={<><span>Mobile number</span>{requiredStar}</>} name="mobile_number" type="tel" value={formData.mobile_number} onChange={handleChange} onBlur={handleBlur} error={fieldErrors.mobile_number} placeholder="WhatsApp number" /></div>
          <Field label={<><span>Personal email</span><span className="ml-1 font-normal text-[#849890]">(optional)</span></>} name="email" type="email" value={formData.email} onChange={handleChange} onBlur={handleBlur} error={fieldErrors.email} placeholder="name@example.com" />
          <div><label className={labelClass}>Nationality</label><input value="Indian" readOnly className={`${inputClass} bg-[#edf3f0]`} /><input type="hidden" name="nationality" value="Indian" /></div>
        </section>

        <section className="space-y-3 rounded-lg border border-[#e4ebe7] bg-[#f7faf8] p-4"><h3 className="border-b border-[#e4ebe7] pb-2 text-sm font-bold uppercase tracking-wider text-[#52736a]">Application and education</h3>
          <div className="grid gap-3 sm:grid-cols-2"><Field label={<><span>Degree</span>{requiredStar}</>} name="degree_qualification" value={formData.degree_qualification} onChange={handleChange} onBlur={handleBlur} error={fieldErrors.degree_qualification} placeholder="e.g. B.Tech" /><div><Field label={<><span>Year of graduation</span>{requiredStar}</>} name="graduation_year" type="number" value={formData.graduation_year} onChange={handleChange} onBlur={handleBlur} error={fieldErrors.graduation_year} placeholder="YYYY" /><p className="mt-1 text-xs font-medium text-red-600">{formData.graduation_year ? getGraduationEligibilityError(formData.graduation_year, formData.date_of_birth) || (Number(formData.graduation_year) > 2023 ? 'Only graduates who passed out before November 2023 are eligible.' : '') : 'Only graduates who passed out before November 2023 are eligible.'}</p></div></div>
          <div className="grid gap-3 sm:grid-cols-2"><div><label className={labelClass}><span>Acknowledgement number</span>{requiredStar}</label><input name="acknowledgement_number" required value={formData.acknowledgement_number} onChange={handleChange} className={inputClass} /></div><div><label className={labelClass}>Notes <span className="font-normal text-[#849890]">(optional)</span></label><input name="notes" value={formData.notes} onChange={handleChange} className={inputClass} placeholder="Add a note if needed" /></div></div>
        </section>

        <section className="space-y-3 rounded-lg border border-[#e4ebe7] bg-[#f7faf8] p-4"><h3 className="border-b border-[#e4ebe7] pb-2 text-sm font-bold uppercase tracking-wider text-[#52736a]">Address and constituency</h3>
          <div className="grid gap-3 sm:grid-cols-2"><Field label={<><span>Region</span>{requiredStar}</>} name="region" value={formData.region} onChange={handleChange} onBlur={handleBlur} error={fieldErrors.region} as="select" disabled={Boolean(user?.assigned_region && user.assigned_region !== 'All')}><option value="">Select region</option>{regions.map(item => <option key={item.region} value={item.region}>{item.region}</option>)}</Field><Field label={<><span>Assembly constituency</span>{requiredStar}</>} name="constituency" value={formData.constituency} onChange={handleChange} onBlur={handleBlur} error={fieldErrors.constituency} as="select" disabled={Boolean(user?.assigned_constituency && user.assigned_constituency !== 'All')}><option value="">Select constituency</option>{assemblies.map(item => <option key={`${item.ac_no}-${item.assembly_constituency}`} value={item.assembly_constituency}>{item.assembly_constituency}</option>)}</Field></div>
          <div className="grid gap-3 sm:grid-cols-2"><Field label={<><span>Booth Num</span>{requiredStar}</>} name="booth_number" value={formData.booth_number} onChange={handleChange} onBlur={handleBlur} error={fieldErrors.booth_number} placeholder="Enter booth number" /><div><label className={labelClass}><span>Mandal</span>{requiredStar}</label><select name="mandal" required value={formData.mandal} onChange={handleChange} disabled={!formData.constituency} className={inputClass}><option value="">Select mandal</option>{mandals.map(item => <option key={item.mandal} value={item.mandal}>{item.mandal}</option>)}</select></div></div>
          <Field label={<><span>Complete address</span>{requiredStar}</>} name="complete_address" value={formData.complete_address} onChange={handleChange} onBlur={handleBlur} error={fieldErrors.complete_address} placeholder="H.No, STREET, city, district" />
          <div className="grid gap-3 sm:grid-cols-2"><Field label={<><span>Village / Ward</span>{requiredStar}</>} name="village" value={formData.village} onChange={handleChange} onBlur={handleBlur} error={fieldErrors.village} placeholder="Enter village or ward" /><Field label={<><span>District</span>{requiredStar}</>} name="district" value={formData.district} onChange={handleChange} onBlur={handleBlur} error={fieldErrors.district} placeholder="Enter district" /></div>
          <div className="grid gap-3 sm:grid-cols-2"><Field label={<><span>State</span>{requiredStar}</>} name="state" value={formData.state} onChange={handleChange} onBlur={handleBlur} error={fieldErrors.state} readOnly /><Field label={<><span>Pincode</span>{requiredStar}</>} name="pincode" value={formData.pincode} onChange={handleChange} onBlur={handleBlur} error={fieldErrors.pincode} placeholder="6-digit pincode" /></div>
        </section>

        <section className="space-y-3 rounded-lg border border-[#e4ebe7] bg-[#f7faf8] p-4"><h3 className="border-b border-[#e4ebe7] pb-2 text-sm font-bold uppercase tracking-wider text-[#52736a]">Supporting documents</h3><label className={labelClass}><span>Supporting documents</span>{requiredStar}</label><div className="relative rounded-md border-2 border-dashed border-[#b6cbc3] bg-white p-5 text-center hover:bg-[#f2f8f4]"><input type="file" multiple onChange={handleFileChange} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" accept=".pdf,.jpg,.jpeg,.png" /><UploadCloud className="mx-auto mb-2 text-[#1d6b5d]" size={24} /><span className="text-sm font-medium text-[#465b55]">{files.length ? files.map(selectedFile => selectedFile.name).join(', ') : 'Choose up to two supporting documents'}</span><p className="mt-1 text-xs text-[#849890]">Select a maximum of 2 files. Accepted file types: PDF, JPG, PNG</p></div></section>
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
