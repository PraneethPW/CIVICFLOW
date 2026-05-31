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
      if (income > 0 && income < 300000 && ["income-certificate", "ration-card", "senior-pension"].includes(service.id)) score += 24;
      if (ownsProperty && ["property-tax", "water-connection"].includes(service.id)) score += 22;
      return { ...service, score: Math.min(100, score) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
}
