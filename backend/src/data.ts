export type Service = {
  id: string;
  title: string;
  department: string;
  category: string;
  duration: string;
  fee: string;
  popularity: number;
  description: string;
  documents: string[];
};

export const services: Service[] = [
  {
    id: "income-certificate",
    title: "Income Certificate",
    department: "Revenue Department",
    category: "Certificates",
    duration: "5-7 days",
    fee: "Rs. 35",
    popularity: 94,
    description: "Apply for verified annual income proof for scholarships, benefits, and subsidies.",
    documents: ["Aadhaar card", "Address proof", "Salary slip or self declaration", "Passport photo"]
  },
  {
    id: "community-certificate",
    title: "Community Certificate",
    department: "Revenue Department",
    category: "Certificates",
    duration: "10-15 days",
    fee: "Rs. 60",
    popularity: 92,
    description: "Get caste or community proof for education, employment, and welfare benefits.",
    documents: ["Aadhaar card", "Parent community proof", "Residence proof", "School certificate", "Passport photo"]
  },
  {
    id: "residence-certificate",
    title: "Residence Certificate",
    department: "Revenue Department",
    category: "Certificates",
    duration: "5-10 days",
    fee: "Rs. 40",
    popularity: 93,
    description: "Apply for official proof of residence for admissions, benefits, and local services.",
    documents: ["Aadhaar card", "Address proof", "Utility bill", "Self declaration", "Passport photo"]
  },
  {
    id: "ration-card",
    title: "Ration Card Update",
    department: "Food and Civil Supplies",
    category: "Family Services",
    duration: "10-14 days",
    fee: "Rs. 20",
    popularity: 89,
    description: "Add, remove, or correct family member details in a ration card.",
    documents: ["Existing ration card", "Aadhaar of members", "Residence proof", "Birth certificate if adding child"]
  },
  {
    id: "property-tax",
    title: "Property Tax Payment",
    department: "Municipal Corporation",
    category: "Urban Services",
    duration: "Instant",
    fee: "As assessed",
    popularity: 83,
    description: "Pay and download receipts for municipal property tax dues.",
    documents: ["Property ID", "Owner ID proof", "Previous receipt"]
  },
  {
    id: "senior-pension",
    title: "Senior Citizen Pension",
    department: "Social Welfare",
    category: "Benefits",
    duration: "21-30 days",
    fee: "Free",
    popularity: 91,
    description: "Monthly pension assistance for eligible senior citizens.",
    documents: ["Age proof", "Income certificate", "Bank passbook", "Aadhaar card", "Passport photo"]
  },
  {
    id: "water-connection",
    title: "New Water Connection",
    department: "Water Board",
    category: "Utilities",
    duration: "12-18 days",
    fee: "Rs. 500+",
    popularity: 77,
    description: "Request a domestic or commercial municipal water connection.",
    documents: ["Property ownership proof", "Address proof", "Identity proof", "Site plan"]
  },
  {
    id: "birth-certificate",
    title: "Birth Certificate",
    department: "Health Department",
    category: "Certificates",
    duration: "3-5 days",
    fee: "Rs. 25",
    popularity: 96,
    description: "Register or download birth certificate copies for official use.",
    documents: ["Hospital discharge summary", "Parent ID proof", "Address proof"]
  },
  {
    id: "death-certificate",
    title: "Death Certificate",
    department: "Health Department",
    category: "Certificates",
    duration: "3-7 days",
    fee: "Rs. 25",
    popularity: 81,
    description: "Register or obtain official death certificate copies for legal and benefit claims.",
    documents: ["Hospital death report", "Applicant ID proof", "Deceased ID proof", "Cremation or burial receipt"]
  },
  {
    id: "aadhaar-services",
    title: "Aadhaar Services",
    department: "UIDAI / Enrollment Center",
    category: "Identity",
    duration: "7-15 days",
    fee: "Rs. 50",
    popularity: 98,
    description: "Update mobile number, address, biometrics, or demographic details in Aadhaar.",
    documents: ["Aadhaar card", "Address proof", "Identity proof", "Mobile number"]
  },
  {
    id: "voter-id-services",
    title: "Voter ID Services",
    department: "Election Commission",
    category: "Identity",
    duration: "15-30 days",
    fee: "Free",
    popularity: 88,
    description: "Apply for new voter ID, address correction, duplicate card, or constituency transfer.",
    documents: ["Age proof", "Address proof", "Passport photo", "Identity proof"]
  },
  {
    id: "pan-card-services",
    title: "PAN Card Services",
    department: "Income Tax Department",
    category: "Identity",
    duration: "7-15 days",
    fee: "Rs. 107",
    popularity: 90,
    description: "Apply for PAN, correct details, request reprint, or link PAN with Aadhaar.",
    documents: ["Identity proof", "Address proof", "Date of birth proof", "Passport photo"]
  },
  {
    id: "scholarship-application",
    title: "Scholarship Application",
    department: "Education Department",
    category: "Education",
    duration: "20-45 days",
    fee: "Free",
    popularity: 95,
    description: "Prepare and submit scholarship applications with income, caste, and academic proofs.",
    documents: ["Income certificate", "Community certificate", "Bonafide certificate", "Marksheet", "Bank passbook", "Aadhaar card"]
  },
  {
    id: "employment-registration",
    title: "Employment Registration",
    department: "Employment Exchange",
    category: "Employment",
    duration: "3-7 days",
    fee: "Free",
    popularity: 84,
    description: "Register for employment exchange services, job alerts, and government opportunities.",
    documents: ["Aadhaar card", "Educational certificates", "Resume", "Address proof", "Passport photo"]
  },
  {
    id: "skill-development",
    title: "Skill Development",
    department: "Skill Development Mission",
    category: "Employment",
    duration: "7-20 days",
    fee: "Free / subsidized",
    popularity: 82,
    description: "Apply for training programs, certification courses, and employability support.",
    documents: ["Aadhaar card", "Education proof", "Income certificate", "Bank passbook", "Passport photo"]
  },
  {
    id: "disability-pension",
    title: "Disability Pension",
    department: "Social Welfare",
    category: "Benefits",
    duration: "21-35 days",
    fee: "Free",
    popularity: 86,
    description: "Apply for monthly financial assistance for eligible persons with disabilities.",
    documents: ["Disability certificate", "Aadhaar card", "Income certificate", "Bank passbook", "Passport photo"]
  },
  {
    id: "housing-scheme",
    title: "Housing Scheme",
    department: "Housing Board",
    category: "Benefits",
    duration: "30-60 days",
    fee: "As per scheme",
    popularity: 87,
    description: "Check eligibility and apply for subsidized housing or housing assistance schemes.",
    documents: ["Income certificate", "Residence certificate", "Aadhaar card", "Land or rent proof", "Bank passbook"]
  },
  {
    id: "health-insurance",
    title: "Health Insurance",
    department: "Health Department",
    category: "Health",
    duration: "5-12 days",
    fee: "Free / subsidized",
    popularity: 89,
    description: "Apply for government health insurance enrollment, family cards, or benefit updates.",
    documents: ["Aadhaar card", "Ration card", "Income certificate", "Family member details", "Passport photo"]
  }
];

export const languages = ["English", "Hindi", "Marathi", "Tamil", "Telugu", "Bengali", "Kannada"];

export function recommendServices(profile: Record<string, unknown>) {
  const age = Number(profile.age || 0);
  const income = Number(profile.income || 0);
  const ownsProperty = Boolean(profile.ownsProperty);
  return services
    .map((service) => {
      let score = service.popularity;
      if (age >= 60 && service.id === "senior-pension") score += 35;
      if (income > 0 && income < 300000 && ["income-certificate", "ration-card", "senior-pension", "scholarship-application", "housing-scheme", "health-insurance", "disability-pension"].includes(service.id)) score += 24;
      if (ownsProperty && ["property-tax", "water-connection"].includes(service.id)) score += 22;
      if (age >= 18 && ["voter-id-services", "employment-registration", "pan-card-services"].includes(service.id)) score += 12;
      return { ...service, score: Math.min(100, score) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
}
