export const quotes: string[] = [
  "Invest in your hair, it is the crown you never take off.",
  "Style is a way to say who you are without having to speak.",
  "Grooming is the secret of real elegance.",
  "A gentleman's choice of cut says everything.",
  "Simplicity is the ultimate sophistication.",
  "Good hair speaks louder than words.",
  "Confidence is the best hairstyle.",
  "Your hair is the ball gown you never take off.",
  "Life is too short to have boring hair.",
  "A fresh cut is a fresh start."
];

export interface MockService {
  id: number;
  name: string;
  duration: string;
  price: string;
  category?: string;
  sub_category?: string;
}

export const services: MockService[] = [
  { id: 1, name: "HAIR CUT", duration: "30 min", price: "₱250", category: "MEN'S GROOMING", sub_category: "Haircut" },
  { id: 2, name: "HAIR CUT W/SHAMPOO", duration: "45 min", price: "₱300", category: "MEN'S GROOMING", sub_category: "Haircut" },
  { id: 3, name: "HAIR ART", duration: "30 min", price: "₱0", category: "TREATMENT SERVICES", sub_category: "Hair Art" },
  { id: 4, name: "HEAD SHAVE", duration: "30 min", price: "₱300", category: "TREATMENT SERVICES", sub_category: "Head Shave" },
  { id: 5, name: "HAIR CUT + HOT OIL", duration: "60 min", price: "₱750", category: "TREATMENT SERVICES", sub_category: "Haircut" },
  { id: 6, name: "HAIR CUT + NATURAL COLOR", duration: "90 min", price: "₱850", category: "TREATMENT SERVICES", sub_category: "Haircut" },
  { id: 7, name: "HAIR CUT + FASHION COLOR", duration: "120 min", price: "₱1500", category: "TREATMENT SERVICES", sub_category: "Haircut" },
  { id: 8, name: "HAIR CUT + HIGHLIGHTS", duration: "120 min", price: "₱1500", category: "TREATMENT SERVICES", sub_category: "Haircut" },
  { id: 9, name: "HAIR CUT + PASTEL COLOR", duration: "150 min", price: "₱2000", category: "TREATMENT SERVICES", sub_category: "Haircut" },
  { id: 10, name: "HAIR PERM", duration: "120 min", price: "₱1800", category: "TREATMENT SERVICES", sub_category: "Hair Perm" },
  { id: 11, name: "THE STANDARD", duration: "45 min", price: "₱350", category: "SPECIAL PROMOS", sub_category: "Packages" },
  { id: 12, name: "THE SUPERIOR", duration: "60 min", price: "₱450", category: "SPECIAL PROMOS", sub_category: "Packages" },
  { id: 13, name: "THE ULTIMATE", duration: "75 min", price: "₱650", category: "SPECIAL PROMOS", sub_category: "Packages" },
  { id: 14, name: "THE HAIR AND SCALP", duration: "90 min", price: "₱850", category: "SPECIAL PROMOS", sub_category: "Packages" },
  { id: 15, name: "THE GRAND SLAM OVERALL", duration: "120 min", price: "₱1000", category: "SPECIAL PROMOS", sub_category: "Packages" },
];

export interface MockBarber {
  id: number;
  name: string;
  specialty: string;
  image: string;
  status?: string;
}

export const barbers: MockBarber[] = [];

export const timeSlots: string[] = ["10:00 AM", "11:30 AM", "1:00 PM", "2:30 PM", "4:00 PM", "5:30 PM"];

export interface MockBranch {
  id: number;
  name: string;
  area: string;
  address: string;
  phone: string;
  hours: string;
  image: string;
  status: string;
}

const getPHTime = () => {
  const phDateStr = new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" });
  const phDate = new Date(phDateStr);
  return {
    day: phDate.getDay(),
    hours: phDate.getHours(),
    minutes: phDate.getMinutes()
  };
};

export const getBranchStatus = (hoursStr: string): string => {
  const { day, hours, minutes } = getPHTime();
  
  if (hoursStr.includes("Mon-Sat") && day === 0) return "Closed Now";
  if (hoursStr.includes("Tue-Sun") && day === 1) return "Closed Now";
  
  const timeMatch = hoursStr.match(/(\d+)(am|pm)\s*-\s*(\d+)(am|pm)/i);
  if (!timeMatch) return "Closed Now";
  
  let openHour = parseInt(timeMatch[1]);
  const openAmPm = timeMatch[2].toLowerCase();
  let closeHour = parseInt(timeMatch[3]);
  const closeAmPm = timeMatch[4].toLowerCase();
  
  if (openAmPm === 'pm' && openHour !== 12) openHour += 12;
  if (openAmPm === 'am' && openHour === 12) openHour = 0;
  
  if (closeAmPm === 'pm' && closeHour !== 12) closeHour += 12;
  if (closeAmPm === 'am' && closeHour === 12) closeHour = 0;
  
  const currentMin = hours * 60 + minutes;
  const openMin = openHour * 60;
  const closeMin = closeHour * 60;
  
  if (currentMin >= openMin && currentMin < closeMin) {
    if (closeMin - currentMin <= 30) {
      return "Closing Soon";
    }
    return "Open Now";
  }
  
  return "Closed Now";
};

export const branches: MockBranch[] = [
  {
    id: 1,
    name: "SampleBranch Branch",
    area: "Bulacan",
    address: "SampleBranch Branch at Ground floor, SampleBranch, Brgy. Kaypian, SJDM, Bulacan.",
    phone: "(02) 8555-0123",
    hours: "Mon-Sat: 10am - 9pm",
    image: "../public/demoshop_interior2.jpg",
    get status() { return getBranchStatus(this.hours); }
  }
];
