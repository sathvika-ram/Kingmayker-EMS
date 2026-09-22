import { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { CheckCircle, Trash2, UploadCloud } from 'lucide-react';
import { API } from '../utils/api';

const inputClass = 'w-full rounded-md border border-[#9bb4ad] bg-white px-3 py-2.5 text-sm text-[#173b35] placeholder:text-[#a4bbb4] focus:border-[#1d6b5d]';
const labelClass = 'mb-1 block text-xs font-semibold text-[#52736a]';
const requiredStar = <span className="text-red-600">*</span>;
const createSubmissionKey = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const formatDateInput = (value) => String(value || '').replace(/[^0-9]/g, '').slice(0, 8).replace(/^(\d{2})(\d)/, '$1-$2').replace(/^(\d{2}-\d{2})(\d)/, '$1-$2');
const parseDateInput = (value) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return new Date(value);
  const [day, month, year] = String(value || '').split('-');
  return new Date(`${year}-${month}-${day}`);
};
const districts = ['Warangal', 'Hanamkonda', 'Jangaon', 'Mahabubabad', 'Jayashankar Bhupalpally', 'Mulugu', 'Khammam', 'Bhadradri Kothagudem', 'Nalgonda', 'Suryapet', 'Yadadri Bhuvanagiri', 'Siddipet'];
const titleCaseWords = (value) => String(value || '').replace(/[^a-zA-Z\s'-]/g, '').replace(/\s+/g, ' ').replace(/(^|[\s'-])([a-z])/g, (_, prefix, letter) => `${prefix}${letter.toUpperCase()}`);
const MAX_IMAGE_BYTES = 200 * 1024;
const compressImage = (file) => new Promise((resolve, reject) => {
  if (!file || !/^image\/(jpeg|png|jpg)$/.test(file.type)) return reject(new Error('Only JPG, JPEG, and PNG images are allowed.'));
  const image = new Image();
  const objectUrl = URL.createObjectURL(file);
  image.onload = () => {
    URL.revokeObjectURL(objectUrl);
    const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    let quality = 0.78;
    const encode = () => canvas.toBlob(blob => {
      if (!blob) return reject(new Error('Unable to compress image.'));
      if (blob.size <= MAX_IMAGE_BYTES || quality <= 0.35) {
        if (blob.size > MAX_IMAGE_BYTES) return reject(new Error('Image must be 200 KB or smaller after compression.'));
        resolve(new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.jpg`, { type: 'image/jpeg' }));
        return;
      }
      quality -= 0.08;
      encode();
    }, 'image/jpeg', quality);
    encode();
  };
  image.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Unable to read image.')); };
  image.src = objectUrl;
});
const isFullAccessAgent = (user) => user?.role === 'constituency_coordinator' && (user?.assigned_region === 'All' || user?.assigned_constituency === 'All' || !user?.assigned_region || !user?.assigned_constituency);
const getInitialFormState = (user) => ({
  voter_name: '', surname: '', father_name: '', date_of_birth: '', mobile_number: '', email: '', gender: '', voter_id: '',
  citizenship_status: true, nationality: 'Indian',
  region: user?.assigned_region && user.assigned_region !== 'All' ? user.assigned_region : '', constituency: user?.assigned_constituency && user.assigned_constituency !== 'All' ? user.assigned_constituency : '', booth_number: '', mandal: '', village: '', polling_station: '', ps_si_number: '', ward: '', post_office: '',
  degree_qualification: '', graduation_year: '',
  form18_number: '', acknowledgement_number: '', reference_number: '', notes: '',
  complete_address: '', district: '', state: 'Telangana', pincode: '', degree_certificate_url: '', degree_certificate_urls: [], submission_key: createSubmissionKey()
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
  const [photoFile, setPhotoFile] = useState(null);
  const [certificateFile, setCertificateFile] = useState(null);
  const [regions, setRegions] = useState([]);
  const [assemblies, setAssemblies] = useState([]);
  const [mandals, setMandals] = useState([]);
  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    const voterId = String(formData.voter_id || '').trim();
    const acknowledgementNumber = String(formData.acknowledgement_number || '').trim();
    if (!voterId && !acknowledgementNumber) return undefined;
    const timer = setTimeout(async () => {
      try {
        const response = await axios.get(`${API}/voters/check-duplicate`, { params: { voter_id: voterId, acknowledgement_number: acknowledgementNumber } });
        setFieldErrors(current => ({
          ...current,
          voter_id: response.data.voter_id_exists ? 'This Voter ID already exists.' : (validateField('voter_id', voterId) || ''),
          acknowledgement_number: response.data.acknowledgement_number_exists ? 'This acknowledgement number already exists.' : (validateField('acknowledgement_number', acknowledgementNumber) || '')
        }));
      } catch {
        setError('Unable to check duplicate voter details. Please try again.');
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [formData.voter_id, formData.acknowledgement_number]);

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
    const birthDate = parseDateInput(dob);
    if (Number.isNaN(birthDate.getTime())) return '';
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age -= 1;
    return age;
  };

  const handleChange = (e) => {
    const { name } = e.target;
    let value = e.target.value;
    if (name === 'voter_id' || name === 'acknowledgement_number' || name === 'booth_number' || name === 'ward' || name === 'ps_si_number') value = value.replace(/[^a-z0-9]/gi, '').toUpperCase();
    if (name === 'voter_name' || name === 'surname' || name === 'father_name') value = titleCaseWords(value);
    if (name === 'degree_qualification') value = titleCaseWords(String(value || '').replace(/[^a-zA-Z .-]/g, ''));
    if (name === 'email') value = value.toLowerCase();
    if (name === 'pincode') value = value.replace(/\D/g, '').slice(0, 6);
    if (name === 'date_of_birth' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) value = formatDateInput(value);
    setFormData(current => ({ ...current, [name]: value }));
    setFieldErrors(current => ({ ...current, [name]: validateField(name, value) }));
  };

  const handleBlur = (e) => setFieldErrors(current => ({ ...current, [e.target.name]: validateField(e.target.name, formData[e.target.name]) }));

  const getGraduationEligibilityError = (graduationYear, dateOfBirth) => {
    if (!graduationYear || !dateOfBirth) return '';
    const year = Number(graduationYear);
    const birthYear = parseDateInput(dateOfBirth).getFullYear();
    if (Number.isNaN(birthYear)) return '';
    if (year > 2023) return 'Only graduates who passed out before November 2023 are eligible.';
    if (year - birthYear < 20) return 'Invalid age';
    return '';
  };

  const validateField = (name, value) => {
    const required = ['voter_id', 'voter_name', 'surname', 'father_name', 'date_of_birth', 'mobile_number', 'gender', 'degree_qualification', 'graduation_year', 'acknowledgement_number', 'region', 'constituency', 'mandal', 'complete_address', 'village', 'district', 'pincode', 'post_office'];
    if (required.includes(name) && !String(value || '').trim()) return 'This field is required.';
    if (name === 'mobile_number' && value && !/^\d{10}$/.test(value)) return 'Mobile number must be exactly 10 digits.';
    if (name === 'email' && value && (!/^\S+@\S+\.[a-z]{2,}$/.test(value) || value !== value.toLowerCase())) return 'Enter a valid lowercase email.';
    if (name === 'voter_id' && value && !/^[A-Z0-9]{10}$/.test(value)) return 'Enter valid Voter ID.';
    if (name === 'acknowledgement_number' && value && !/^[A-Z0-9]{12}$/.test(value)) return 'Enter a valid acknowledgement number: exactly 12 uppercase letters or numbers.';
    if ((name === 'booth_number' || name === 'ward') && value && !/^[A-Z0-9]+$/.test(value)) return 'Enter a valid ward number using uppercase letters and numbers only.';
    if (['voter_name', 'surname', 'father_name'].includes(name) && value && !/^[A-Za-z]+(?:[ '\-][A-Za-z]+)*$/.test(value)) return 'Use alphabets only.';
    if (name === 'degree_qualification' && value && !/^[A-Za-z]+(?:[ .\-][A-Za-z]+)*$/.test(value)) return 'Use alphabets only.';
    if (name === 'date_of_birth' && value && !/^\d{4}-\d{2}-\d{2}$/.test(value) && !/^\d{2}-\d{2}-\d{4}$/.test(value)) return 'Select a valid date.';
    if (name === 'graduation_year' && value && (Number(value) < 1900 || Number(value) > 2023)) return 'Only graduates who passed out before November 2023 are eligible.';
    if (name === 'pincode' && value && !/^\d{6}$/.test(value)) return 'Pincode must be exactly 6 digits.';
    if (name === 'date_of_birth' && value && calculateAge(value) < 20) return 'Voter must be at least 20 years old.';
    if (name === 'graduation_year' && value && formData.date_of_birth) {
      const birthYear = parseDateInput(formData.date_of_birth).getFullYear();
      if (!Number.isNaN(birthYear) && Number(value) - birthYear < 20) return 'Invalid age';
    }
    if (name === 'date_of_birth' && value && formData.graduation_year) {
      const birthYear = parseDateInput(value).getFullYear();
      if (!Number.isNaN(birthYear) && Number(formData.graduation_year) - birthYear < 20) return 'Invalid age';
    }
    return '';
  };

  const handleImageChange = async (event, type) => {
    const selectedFile = event.target.files?.[0];
    event.target.value = '';
    if (!selectedFile) return;
    try {
      const compressed = await compressImage(selectedFile);
      if (type === 'photo') setPhotoFile(compressed);
      else setCertificateFile(compressed);
      setError('');
    } catch (uploadError) {
      setError(uploadError.message);
    }
  };

  const submitEnrollment = async () => {
    setLoading(true);
    try {
      const enrollmentData = { ...formData, coordinator_id: coordinatorId || user.id, voter_name: `${formData.voter_name} ${formData.surname}`.trim(), booth_number: formData.ward || '' };
      delete enrollmentData.application_type;
      if (photoFile || certificateFile) {
        const uploadData = new FormData();
        if (photoFile) uploadData.append('photo', photoFile);
        if (certificateFile) uploadData.append('degree_certificate', certificateFile);
        try {
          const uploadResponse = await axios.post(`${API}/uploads`, uploadData);
          enrollmentData.photo_url = uploadResponse.data.photo_url || '';
          enrollmentData.degree_certificate_url = uploadResponse.data.degree_certificate_urls?.[0] || '';
          enrollmentData.degree_certificate_urls = uploadResponse.data.degree_certificate_urls || [];
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
      setPhotoFile(null);
      setCertificateFile(null);
      onSubmitted?.();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit enrollment');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (loading) return;
    setError('');
    const nextErrors = Object.keys(formData).reduce((errors, name) => ({ ...errors, [name]: validateField(name, formData[name]) }), {});
    if (fieldErrors.voter_id?.includes('already exists')) nextErrors.voter_id = fieldErrors.voter_id;
    if (fieldErrors.acknowledgement_number?.includes('already exists')) nextErrors.acknowledgement_number = fieldErrors.acknowledgement_number;
    setFieldErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return setError('Please correct the highlighted fields.');
    if (!formData.acknowledgement_number) return setError('Acknowledgement number is required.');
    if (formData.graduation_year && Number(formData.graduation_year) > 2023) return setError('Only graduates who passed out before November 2023 are eligible.');
    if (formData.graduation_year && formData.date_of_birth) {
      const birthYear = parseDateInput(formData.date_of_birth).getFullYear();
      if (!Number.isNaN(birthYear) && Number(formData.graduation_year) - birthYear < 20) return setError('Invalid age');
    }
    if (!formData.form18_number && !formData.acknowledgement_number && !formData.reference_number) return setError('Enter Form 18, acknowledgement, or reference number.');

    submitEnrollment();
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
          <div className="grid gap-3 sm:grid-cols-2"><Field label={<><span>Voter ID</span>{requiredStar}</>} name="voter_id" value={formData.voter_id} onChange={handleChange} onBlur={handleBlur} error={fieldErrors.voter_id} maxLength={10} placeholder="Enter Valid Voter ID" /><Field label={<><span>Gender</span>{requiredStar}</>} name="gender" value={formData.gender} onChange={handleChange} onBlur={handleBlur} error={fieldErrors.gender} as="select"><option value="" disabled hidden>Select Gender</option><option>Female</option><option>Male</option><option>Other</option></Field></div>
          <div className="grid gap-3 sm:grid-cols-2"><Field label={<><span>Name</span>{requiredStar}</>} name="voter_name" value={formData.voter_name} onChange={handleChange} onBlur={handleBlur} error={fieldErrors.voter_name} placeholder="Enter your name" /><Field label={<><span>Surname</span>{requiredStar}</>} name="surname" value={formData.surname} onChange={handleChange} onBlur={handleBlur} error={fieldErrors.surname} placeholder="Enter your surname" /></div>
          <div><Field label={<><span>Father's name / Husband's name</span>{requiredStar}</>} name="father_name" value={formData.father_name} onChange={handleChange} onBlur={handleBlur} error={fieldErrors.father_name} placeholder="Enter complete name with surname" /></div>
          <div className="grid gap-3 sm:grid-cols-3"><div><label className={labelClass}><span>Date of birth</span>{requiredStar}</label><input type="date" name="date_of_birth" required value={/^\d{4}-\d{2}-\d{2}$/.test(formData.date_of_birth) ? formData.date_of_birth : ''} onChange={handleChange} onBlur={handleBlur} min="1900-01-01" max={new Date().toISOString().slice(0, 10)} className={`${inputClass} ${fieldErrors.date_of_birth ? 'border-[#c45d52] bg-[#fff8f7]' : ''}`} />{fieldErrors.date_of_birth && <p className="mt-1 text-xs font-medium text-[#b44d45]" role="alert">{fieldErrors.date_of_birth}</p>}</div><div><label className={labelClass}>Age</label><input readOnly value={calculateAge(formData.date_of_birth)} className={`${inputClass} bg-[#edf3f0]`} placeholder="Auto-calculated" />{formData.date_of_birth && formData.graduation_year && getGraduationEligibilityError(formData.graduation_year, formData.date_of_birth) === 'Invalid age' && <p className="mt-1 text-xs font-medium text-[#b44d45]" role="alert">Invalid age</p>}</div><Field label={<><span>Mobile number</span>{requiredStar}</>} name="mobile_number" type="tel" value={formData.mobile_number} onChange={handleChange} onBlur={handleBlur} error={fieldErrors.mobile_number} placeholder="WhatsApp number" /></div>
          <Field label={<><span>Personal email</span><span className="ml-1 font-normal text-[#849890]">(optional)</span></>} name="email" type="email" value={formData.email} onChange={handleChange} onBlur={handleBlur} error={fieldErrors.email} placeholder="name@example.com" />
          <div><label className={labelClass}>Nationality</label><input value="Indian" readOnly className={`${inputClass} bg-[#edf3f0]`} /><input type="hidden" name="nationality" value="Indian" /></div>
        </section>

        <section className="space-y-3 rounded-lg border border-[#e4ebe7] bg-[#f7faf8] p-4"><h3 className="border-b border-[#e4ebe7] pb-2 text-sm font-bold uppercase tracking-wider text-[#52736a]">Application and education</h3>
          <div className="grid gap-3 sm:grid-cols-2"><Field label={<><span>Educational qualification</span>{requiredStar}</>} name="degree_qualification" value={formData.degree_qualification} onChange={handleChange} onBlur={handleBlur} error={fieldErrors.degree_qualification} placeholder="Enter educational qualification" /><div><Field label={<><span>Year of graduation</span>{requiredStar}</>} name="graduation_year" type="number" value={formData.graduation_year} onChange={handleChange} onBlur={handleBlur} error={fieldErrors.graduation_year} placeholder="YYYY" /><p className="mt-1 text-xs font-medium text-red-600">{formData.graduation_year ? getGraduationEligibilityError(formData.graduation_year, formData.date_of_birth) || (Number(formData.graduation_year) > 2023 ? 'Only graduates who passed out before November 2023 are eligible.' : '') : 'Only graduates who passed out before November 2023 are eligible.'}</p></div></div>
          <div className="grid gap-3 sm:grid-cols-2"><div><label className={labelClass}><span>Acknowledgement number</span>{requiredStar}</label><input name="acknowledgement_number" required value={formData.acknowledgement_number} onChange={handleChange} onBlur={handleBlur} maxLength={12} placeholder="12 uppercase letters/numbers" className={`${inputClass} ${fieldErrors.acknowledgement_number ? 'border-[#c45d52] bg-[#fff8f7]' : ''}`} />{fieldErrors.acknowledgement_number && <p className="mt-1 text-xs font-medium text-[#b44d45]" role="alert">{fieldErrors.acknowledgement_number}</p>}</div><div><label className={labelClass}>Notes <span className="font-normal text-[#849890]">(optional)</span></label><input name="notes" value={formData.notes} onChange={handleChange} className={inputClass} placeholder="Add a note if needed" /></div></div>
        </section>

        <section className="space-y-3 rounded-lg border border-[#e4ebe7] bg-[#f7faf8] p-4"><h3 className="border-b border-[#e4ebe7] pb-2 text-sm font-bold uppercase tracking-wider text-[#52736a]">Address and constituency</h3><a href="https://electoralsearch.eci.gov.in/" target="_blank" rel="noreferrer" className="font-bold text-[#1d6b5d] underline">Know Your Voter Details</a>
          <div className="grid gap-3 sm:grid-cols-2"><Field label={<><span>Region</span>{requiredStar}</>} name="region" value={formData.region} onChange={handleChange} onBlur={handleBlur} error={fieldErrors.region} as="select" disabled={Boolean(user?.assigned_region && user.assigned_region !== 'All')}><option value="">Select region</option>{regions.map(item => <option key={item.region} value={item.region}>{item.region}</option>)}</Field><Field label={<><span>Assembly constituency</span>{requiredStar}</>} name="constituency" value={formData.constituency} onChange={handleChange} onBlur={handleBlur} error={fieldErrors.constituency} as="select" disabled={Boolean(user?.assigned_constituency && user.assigned_constituency !== 'All')}><option value="">Select constituency</option>{assemblies.map(item => <option key={`${item.ac_no}-${item.assembly_constituency}`} value={item.assembly_constituency}>{item.assembly_constituency}</option>)}</Field></div>
          <div className="grid gap-3 sm:grid-cols-2"><Field label={<><span>Polling station</span><span className="ml-1 font-normal text-[#849890]">(optional)</span></>} name="polling_station" value={formData.polling_station} onChange={handleChange} onBlur={handleBlur} error={fieldErrors.polling_station} placeholder="Enter polling station" /><Field label={<><span>S.I. No. in PS</span><span className="ml-1 font-normal text-[#849890]">(optional)</span></>} name="ps_si_number" value={formData.ps_si_number} onChange={handleChange} onBlur={handleBlur} error={fieldErrors.ps_si_number} placeholder="Enter S.I. number" /></div>
          <div className="grid gap-3 sm:grid-cols-2"><Field label={<><span>Ward</span><span className="ml-1 font-normal text-[#849890]">(optional)</span></>} name="ward" value={formData.ward} onChange={handleChange} onBlur={handleBlur} error={fieldErrors.ward} placeholder="Uppercase letters/numbers" /><div><label className={labelClass}><span>Mandal</span>{requiredStar}</label><select name="mandal" required value={formData.mandal} onChange={handleChange} disabled={!formData.constituency} className={inputClass}><option value="">Select mandal</option>{mandals.map(item => <option key={item.mandal} value={item.mandal}>{item.mandal}</option>)}</select></div></div>
          <Field label={<><span>Complete address</span>{requiredStar}</>} name="complete_address" value={formData.complete_address} onChange={handleChange} onBlur={handleBlur} error={fieldErrors.complete_address} placeholder="H.No, STREET, city, district" />
          <div className="grid gap-3 sm:grid-cols-2"><Field label={<><span>Village</span>{requiredStar}</>} name="village" value={formData.village} onChange={handleChange} onBlur={handleBlur} error={fieldErrors.village} placeholder="Enter village" /><Field label={<><span>District</span>{requiredStar}</>} name="district" value={formData.district} onChange={handleChange} onBlur={handleBlur} error={fieldErrors.district} as="select"><option value="">Select district</option>{districts.map(district => <option key={district} value={district}>{district}</option>)}</Field></div>
          <Field label={<><span>Post office</span>{requiredStar}</>} name="post_office" value={formData.post_office} onChange={handleChange} onBlur={handleBlur} error={fieldErrors.post_office} placeholder="Enter post office" />
          <div className="grid gap-3 sm:grid-cols-2"><Field label={<><span>State</span>{requiredStar}</>} name="state" value={formData.state} onChange={handleChange} onBlur={handleBlur} error={fieldErrors.state} readOnly /><Field label={<><span>Pincode</span>{requiredStar}</>} name="pincode" type="text" inputMode="numeric" maxLength={6} pattern="[0-9]{6}" value={formData.pincode} onChange={handleChange} onBlur={handleBlur} error={fieldErrors.pincode} placeholder="6-digit numeric pincode" /></div>
        </section>

        <section className="space-y-3 rounded-lg border border-[#e4ebe7] bg-[#f7faf8] p-4"><h3 className="border-b border-[#e4ebe7] pb-2 text-sm font-bold uppercase tracking-wider text-[#52736a]">Supporting uploads <span className="font-normal normal-case text-[#849890]">(optional, max 200 KB each)</span></h3><div className="grid gap-4 sm:grid-cols-2"><UploadBox label="Photo" file={photoFile} onChange={event => handleImageChange(event, 'photo')} onRemove={() => setPhotoFile(null)} /><UploadBox label="Degree certificate" file={certificateFile} onChange={event => handleImageChange(event, 'certificate')} onRemove={() => setCertificateFile(null)} /></div><p className="text-xs text-[#849890]">Accepted formats: JPG, JPEG, PNG. Images are compressed before secure upload.</p></section>
        <button type="submit" disabled={loading} aria-busy={loading} className="w-full rounded-md bg-[#173b35] px-4 py-3 font-bold text-white shadow-sm transition hover:bg-[#28584e] disabled:cursor-not-allowed disabled:opacity-60">{loading ? <span className="mx-auto block h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" aria-label="Submitting enrollment" /> : 'Submit enrollment'}</button>
      </form>
    </div>
  );
}

function UploadBox({ label, file, onChange, onRemove }) {
  return <div className="rounded-md border border-[#d8e5df] bg-white p-3"><div className="relative rounded-md border-2 border-dashed border-[#b6cbc3] p-4 text-center hover:bg-[#f2f8f4]"><input type="file" onChange={onChange} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" accept=".jpg,.jpeg,.png,image/jpeg,image/png" /><UploadCloud className="mx-auto mb-2 text-[#1d6b5d]" size={22} /><span className="block text-sm font-medium text-[#465b55]">{file ? file.name : `Choose ${label.toLowerCase()}`}</span></div>{file && <button type="button" onClick={onRemove} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#b44d45] hover:text-[#8f3932]"><Trash2 size={14} /> Remove</button>}</div>;
}

function Field({ label, name, value, onChange, onBlur, error, as = 'input', children, ...props }) {
  const Control = as;
  return <div>
    <label className={labelClass}>{label}</label>
    <Control name={name} value={value} onChange={onChange} onBlur={onBlur} className={`${inputClass} ${error ? 'border-[#c45d52] bg-[#fff8f7]' : ''}`} {...props}>{children}</Control>
    {error && <p className="mt-1 text-xs font-medium text-[#b44d45]" role="alert">{error}</p>}
  </div>;
}
