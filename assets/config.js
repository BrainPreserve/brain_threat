/* ============================================================
   Brain Threat Analysis — Config
   Clean rebuild from WP + master.csv (strict contract)
   ------------------------------------------------------------
   - Defines category and instrument structure
   - Defines scale options, reverse scoring flags, weight bands
   - Bands/tiers come ONLY from WP code (not CSV)
   - CSV is used strictly for threat/brand lookups at runtime
   ============================================================ */

const CONFIG = {
  categories: [
    {
      id: "personal",
      label: "Personal History",
      instruments: [
        {
          id: "history",
          label: "Personal History Questionnaire",
          items: [
            { key: "heart", label: "History of heart disease", yesTier: "High" },
            { key: "stroke", label: "History of stroke or TIA", yesTier: "High" },
            { key: "thy", label: "History of thyroid disease", yesTier: "Moderate" },
            { key: "chol", label: "History of high cholesterol", yesTier: "Moderate" },
            { key: "head", label: "History of head trauma", yesTier: "Moderate" },
            { key: "fam", label: "Family history of dementia", yesTier: "High" }
          ]
        },
        {
          id: "medical_lifestyle",
          label: "Medical & Lifestyle Questionnaire",
          items: [
            { key: "bp", label: "History of hypertension", yesTier: "Moderate" },
            { key: "dm", label: "History of diabetes", yesTier: "High" },
            { key: "afib", label: "History of atrial fibrillation", yesTier: "High" },
            { key: "smoking", label: "Current smoker", yesTier: "High" }
          ]
        },
        {
          id: "sleep",
          label: "Sleep Questionnaire",
          scale: { Never: 0, Rarely: 1, Sometimes: 2, Often: 3, Always: 4 },
          tiers: [
            { min: 0, max: 5, label: "None" },
            { min: 6, max: 11, label: "Mild" },
            { min: 12, max: 17, label: "Moderate" },
            { min: 18, max: 24, label: "Severe" }
          ],
          items: [
            { key: "sleep1", label: "I have trouble falling asleep" },
            { key: "sleep2", label: "I wake frequently during the night" },
            { key: "sleep3", label: "I wake too early and can’t get back to sleep" },
            { key: "sleep4", label: "My sleep is not refreshing" },
            { key: "sleep5", label: "I feel sleepy during the day" },
            { key: "sleep6", label: "I nap excessively" }
          ]
        },
        {
          id: "stress",
          label: "Stress (PSS-4)",
          scale: { Never: 0, AlmostNever: 1, Sometimes: 2, FairlyOften: 3, VeryOften: 4 },
          reverse: ["stress2", "stress3"],
          tiers: [
            { min: 0, max: 5, label: "Low" },
            { min: 6, max: 10, label: "Moderate" },
            { min: 11, max: 16, label: "High" }
          ],
          items: [
            { key: "stress1", label: "Unable to control important things" },
            { key: "stress2", label: "Felt confident about handling problems" },
            { key: "stress3", label: "Felt things were going your way" },
            { key: "stress4", label: "Difficulties piling up too high" }
          ]
        },
        {
          id: "activity",
          label: "Physical Activity",
          items: [
            { key: "steps", label: "Do you walk at least 7,000 steps per day?", noTier: "Moderate" },
            { key: "aerobic", label: "Do you do ≥150 minutes/week aerobic exercise?", noTier: "High" },
            { key: "strength", label: "Do you do ≥2 strength sessions per week?", noTier: "High" }
          ]
        }
      ]
    },
    {
      id: "social",
      label: "Social & Loneliness Assessment",
      instruments: [
        {
          id: "lsns6",
          label: "Lubben Social Network Scale (LSNS-6)",
          scale: { None: 0, One: 1, Two: 2, ThreeOrFour: 3, FiveToEight: 4, NineOrMore: 5 },
          items: [
            { key: "lsns1", label: "How many relatives do you see/hear from at least monthly?" },
            { key: "lsns2", label: "How many relatives do you feel at ease with to talk about private matters?" },
            { key: "lsns3", label: "How many relatives can you call on for help?" },
            { key: "lsns4", label: "How many friends do you see/hear from at least monthly?" },
            { key: "lsns5", label: "How many friends do you feel at ease with to talk about private matters?" },
            { key: "lsns6", label: "How many friends can you call on for help?" }
          ]
        },
        {
          id: "ucla3",
          label: "UCLA Loneliness Scale (3-item)",
          scale: { HardlyEver: 1, SomeOfTheTime: 2, Often: 3 },
          items: [
            { key: "ucla1", label: "How often do you feel that you lack companionship?" },
            { key: "ucla2", label: "How often do you feel left out?" },
            { key: "ucla3", label: "How often do you feel isolated from others?" }
          ]
        }
      ]
    },
    {
      id: "sensory",
      label: "Sensory Assessment",
      instruments: [
        {
          id: "hhie",
          label: "Hearing (HHIE-S)",
          scale: { Yes: 4, Sometimes: 2, No: 0 },
          items: [
            { key: "h1", label: "Does a hearing problem cause you to use the phone less?" },
            { key: "h2", label: "Does a hearing problem cause you to feel embarrassed?" },
            { key: "h3", label: "Does a hearing problem cause you to visit friends less?" },
            { key: "h4", label: "Does a hearing problem cause you problems with neighbors or family?" },
            { key: "h5", label: "Does a hearing problem cause you to attend religious services less?" },
            { key: "h6", label: "Does a hearing problem cause arguments with family?" },
            { key: "h7", label: "Does a hearing problem cause you difficulty listening to TV?" },
            { key: "h8", label: "Does a hearing problem cause you to feel nervous?" },
            { key: "h9", label: "Does a hearing problem cause you to visit restaurants less?" },
            { key: "h10", label: "Does a hearing problem cause you difficulty in conversations?" }
          ]
        },
        {
          id: "vfq3of7",
          label: "Vision (VFQ-3 of 7)",
          scale: { None: 0, Mild: 1, Moderate: 2, Severe: 3, Extreme: 4 },
          items: [
            { key: "v1", label: "How much difficulty do you have reading ordinary print in newspapers?" },
            { key: "v2", label: "How much difficulty do you have reading street signs?" },
            { key: "v3", label: "How much difficulty do you have doing close work (e.g., sewing)?" },
            { key: "v4", label: "How much difficulty do you have seeing steps, stairs, or curbs?" },
            { key: "v5", label: "How much difficulty do you have noticing objects off to the side?" },
            { key: "v6", label: "How much difficulty do you have finding things on a crowded shelf?" },
            { key: "v7", label: "How much difficulty do you have going out to movies, plays, or sports events?" }
          ]
        }
      ]
    },
    {
      id: "meds",
      label: "Medication Threat Assessment",
      instruments: [
        { id: "medications", label: "Medication Classes and Items", items: [] }
      ]
    },
    {
      id: "microplastics",
      label: "Micro/Nanoplastic Exposure Assessment",
      instruments: [
        { id: "plastics", label: "Micro/Nanoplastic Items", items: [] }
      ]
    },
    {
      id: "toxins",
      label: "Toxin Exposure Assessment",
      instruments: [
        { id: "toxins", label: "Toxin/Exposure Items", items: [] }
      ]
    },
    {
      id: "foods",
      label: "Brain Threat Foods and Additives Assessment",
      instruments: [
        { id: "foods", label: "Food/Additive Items", items: [] }
      ]
    }
  ],

  // Age and BMI bands from WP code (hard-coded; not CSV)
  ageBands: [
    { min: 0, max: 54, label: "Low" },
    { min: 55, max: 60, label: "Moderate" },
    { min: 61, max: 70, label: "High" },
    { min: 71, max: 80, label: "Very High" },
    { min: 81, max: 200, label: "Extreme" }
  ],

  bmiBands: [
    { min: 0, max: 19, label: "Low" },
    { min: 20, max: 24, label: "Optimal" },
    { min: 25, max: 29, label: "Moderate" },
    { min: 30, max: 32, label: "High" },
    { min: 33, max: 39, label: "Very High" },
    { min: 40, max: 200, label: "Extreme" }
  ]
};

// Export for modules
if (typeof window !== "undefined") {
  window.CONFIG = CONFIG;
}
