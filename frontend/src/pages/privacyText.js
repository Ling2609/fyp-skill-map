// The privacy notice text, in English and Bahasa Malaysia (14 Oct). Malaysia's PDPA 2010 s.7: the notice must say what
// is processed, the purposes, the source, the right of access and correction and how to make enquiries or complaints,
// the classes of third parties, the choices for limiting processing, which data is obligatory and what happens if it
// isn't given; in the national language and English (references.md "Privacy notice"). Facts: docs/data_flow.md.
// The Bahasa Malaysia text is a draft translation to be proofread before release.

export const UPDATED = { en: 'Last updated 14 October 2026', ms: 'Kemas kini terakhir 14 Oktober 2026' }

export const IN_SHORT = {
  en: {
    title: 'In short',
    lines: [
      ['We collect', 'your account details, academic record and projects, and contact details if you add them.'],
      ['We use them', 'to match your skills to jobs and explain your skill gaps.'],
      ['Employers see', 'your profile only when you apply or choose to be visible; your contact details only if they shortlist you.'],
      ['Our AI provider', '(Groq, United States) reads the text of your projects and chats to find skills and answer you.'],
      ['You can', 'see, correct, download or delete your data at any time.'],
    ],
  },
  ms: {
    title: 'Secara ringkas',
    lines: [
      ['Kami mengumpul', 'butiran akaun, rekod akademik dan projek anda, serta butiran hubungan jika anda menambahnya.'],
      ['Kami menggunakannya', 'untuk memadankan kemahiran anda dengan pekerjaan dan menerangkan jurang kemahiran anda.'],
      ['Majikan melihat', 'profil anda hanya apabila anda memohon atau memilih untuk kelihatan; butiran hubungan anda hanya jika mereka menyenarai pendek anda.'],
      ['Pembekal AI kami', '(Groq, Amerika Syarikat) membaca teks projek dan perbualan anda untuk mengenal pasti kemahiran dan menjawab anda.'],
      ['Anda boleh', 'melihat, membetulkan, memuat turun atau memadam data anda pada bila-bila masa.'],
    ],
  },
}

// The table in section 2: [what, required or optional, why]
export const DATA_TABLE = {
  en: {
    head: ['Information', 'Required?', 'Why we need it'],
    rows: [
      ['Name, username, email, password', 'Required', 'To create and secure your account'],
      ['Programme and intake (students)', 'Required', 'To list the modules you take'],
      ['Module grades', 'Optional', 'Show how strong the evidence for a skill is'],
      ['Projects, certifications, awards', 'Optional', 'Find skills beyond your modules'],
      ['Phone, city, available from', 'Optional', 'Let a shortlisting employer contact you'],
      ['Career goal', 'Optional', 'Focus your Dashboard on one kind of job'],
      ['Company name (employers)', 'Required', 'So the career office can approve the account'],
    ],
    note: 'Without the required information an account cannot be created. Leaving out optional information means SkillMap finds fewer of your skills and fewer matching jobs.',
  },
  ms: {
    head: ['Maklumat', 'Wajib?', 'Mengapa kami memerlukannya'],
    rows: [
      ['Nama, nama pengguna, e-mel, kata laluan', 'Wajib', 'Untuk mencipta dan melindungi akaun anda'],
      ['Program dan pengambilan (pelajar)', 'Wajib', 'Untuk menyenaraikan modul yang anda ambil'],
      ['Gred modul', 'Pilihan', 'Menunjukkan kekuatan bukti bagi sesuatu kemahiran'],
      ['Projek, pensijilan, anugerah', 'Pilihan', 'Mengenal pasti kemahiran selain daripada modul anda'],
      ['Telefon, bandar, tersedia mulai', 'Pilihan', 'Membolehkan majikan yang menyenarai pendek anda menghubungi anda'],
      ['Matlamat kerjaya', 'Pilihan', 'Memfokuskan Papan Pemuka anda pada satu jenis pekerjaan'],
      ['Nama syarikat (majikan)', 'Wajib', 'Supaya pejabat kerjaya boleh meluluskan akaun'],
    ],
    note: 'Tanpa maklumat wajib, akaun tidak boleh dicipta. Jika maklumat pilihan tidak diberikan, SkillMap akan menemui lebih sedikit kemahiran anda dan lebih sedikit pekerjaan yang sepadan.',
  },
}

// Sections: [id, title, bullet points]. Section 2 also shows DATA_TABLE.
export const SECTIONS = {
  en: [
    ['who', 'Who we are and how to contact us', [
      'SkillMap is a career platform that maps a student\'s academic record and projects to the skills employers ask for.',
      'The **university\'s career office** runs SkillMap and is responsible for your personal data. It also approves employer accounts.',
      'For any question about your personal data, email the career office at {contact}.',
    ]],
    ['collect', 'What we collect and where it comes from', [
      'Almost everything comes **from you**: what you type at sign-up and in My Profile.',
      'Module names and descriptions come **from the university**; skills in them are found by our AI and checked by the career office.',
      'If you import a GitHub repository, we read that **public** repository only.',
      'We also keep your **applications and their progress**, invitations to apply, your **AI Assistant conversations**, and security records (failed sign-ins, one-time codes that expire).',
      'We **do not ask** for your identity card number, date of birth, gender, race, religion or a photograph.',
    ]],
    ['why', 'Why we use it', [
      'To identify your skills, **match them to jobs**, explain which skills you have and which are missing, and suggest how to learn them.',
      'To let you **apply** for jobs posted on SkillMap and follow the progress of your applications.',
      'To keep your account **secure**.',
    ]],
    ['share', 'Who we share it with', [
      '**Employers:** your profile and skill match when you apply for one of their jobs, or when you are visible and fit one of their jobs. Your grades only if you allow it. Your **email, phone, city and availability only after they shortlist you**.',
      '**Other students:** never your profile; only anonymous totals for a job, such as how many people applied.',
      '**The career office:** accounts, to approve employers and handle misuse.',
      '**Service providers:** our AI provider (Groq) and our email service, only to run SkillMap.',
    ]],
    ['abroad', 'Information sent outside Malaysia', [
      'The text of your projects, certifications, awards and AI Assistant messages is sent to **Groq in the United States** to identify skills and answer you. Groq does not keep it by default, but may keep it for **up to 30 days** to investigate errors or abuse.',
      'Job advertisements, which contain no student data, are also read by Groq and formatted by Gemini.',
    ]],
    ['keep', 'How long we keep it', [
      'Your data is kept **while your account exists**.',
      'When you **delete your account**, your profile, grades, projects, certifications, awards, applications, invitations and AI Assistant conversations are deleted.',
      'One-time codes are deleted once used or expired.',
    ]],
    ['choices', 'Your choices', [
      'Leave optional information out, or remove it at any time.',
      'Turn **"Visible to employers"** off, and **"Show grades"** off, in My Profile.',
      'Delete single projects, certificates, awards or AI Assistant conversations.',
    ]],
    ['rights', 'Your rights', [
      '**See and correct** your information in My Profile and Account settings.',
      '**Download** a copy of everything SkillMap holds about you: Account settings → Download my data.',
      '**Delete** your account and its data: Account settings → Delete account.',
    ]],
    ['complain', 'How to complain', [
      'Email the **career office** first at {contact}; they will reply and correct any mistake.',
      'If you are not satisfied, you may complain to the **Personal Data Protection Commissioner** of Malaysia.',
    ]],
    ['changes', 'Changes to this notice', [
      'If this notice changes, the date at the top of this page changes and the main changes are listed here.',
    ]],
  ],
  ms: [
    ['who', 'Siapa kami dan cara menghubungi kami', [
      'SkillMap ialah platform kerjaya yang memetakan rekod akademik dan projek pelajar kepada kemahiran yang diperlukan oleh majikan.',
      '**Pejabat kerjaya universiti** mengendalikan SkillMap dan bertanggungjawab ke atas data peribadi anda. Ia juga meluluskan akaun majikan.',
      'Untuk sebarang pertanyaan tentang data peribadi anda, e-mel pejabat kerjaya di {contact}.',
    ]],
    ['collect', 'Apa yang kami kumpul dan dari mana', [
      'Hampir semua maklumat datang **daripada anda**: apa yang anda taip semasa mendaftar dan dalam Profil Saya.',
      'Nama dan penerangan modul datang **daripada universiti**; kemahiran di dalamnya dikenal pasti oleh AI kami dan disemak oleh pejabat kerjaya.',
      'Jika anda mengimport repositori GitHub, kami hanya membaca repositori **awam** tersebut.',
      'Kami juga menyimpan **permohonan anda dan kemajuannya**, jemputan untuk memohon, **perbualan Pembantu AI** anda, dan rekod keselamatan (log masuk yang gagal, kod sekali guna yang tamat tempoh).',
      'Kami **tidak meminta** nombor kad pengenalan, tarikh lahir, jantina, kaum, agama atau gambar anda.',
    ]],
    ['why', 'Mengapa kami menggunakannya', [
      'Untuk mengenal pasti kemahiran anda, **memadankannya dengan pekerjaan**, menerangkan kemahiran yang anda ada dan yang kurang, serta mencadangkan cara mempelajarinya.',
      'Untuk membolehkan anda **memohon** pekerjaan yang disiarkan di SkillMap dan mengikuti kemajuan permohonan anda.',
      'Untuk memastikan akaun anda **selamat**.',
    ]],
    ['share', 'Dengan siapa kami berkongsi', [
      '**Majikan:** profil dan padanan kemahiran anda apabila anda memohon salah satu pekerjaan mereka, atau apabila anda kelihatan dan sesuai dengan salah satu pekerjaan mereka. Gred anda hanya jika anda membenarkannya. **E-mel, telefon, bandar dan tarikh tersedia anda hanya selepas mereka menyenarai pendek anda**.',
      '**Pelajar lain:** tidak sekali-kali melihat profil anda; hanya jumlah tanpa nama bagi sesuatu pekerjaan, seperti bilangan pemohon.',
      '**Pejabat kerjaya:** akaun, untuk meluluskan majikan dan menangani salah guna.',
      '**Penyedia perkhidmatan:** pembekal AI kami (Groq) dan perkhidmatan e-mel kami, hanya untuk mengendalikan SkillMap.',
    ]],
    ['abroad', 'Maklumat yang dihantar ke luar Malaysia', [
      'Teks projek, pensijilan, anugerah dan mesej Pembantu AI anda dihantar kepada **Groq di Amerika Syarikat** untuk mengenal pasti kemahiran dan menjawab anda. Groq tidak menyimpannya secara lalai, tetapi mungkin menyimpannya **sehingga 30 hari** untuk menyiasat ralat atau salah guna.',
      'Iklan pekerjaan, yang tidak mengandungi data pelajar, juga dibaca oleh Groq dan diformatkan oleh Gemini.',
    ]],
    ['keep', 'Berapa lama kami menyimpannya', [
      'Data anda disimpan **selagi akaun anda wujud**.',
      'Apabila anda **memadam akaun**, profil, gred, projek, pensijilan, anugerah, permohonan, jemputan dan perbualan Pembantu AI anda dipadam.',
      'Kod sekali guna dipadam sebaik sahaja digunakan atau tamat tempoh.',
    ]],
    ['choices', 'Pilihan anda', [
      'Tidak memberikan maklumat pilihan, atau membuangnya pada bila-bila masa.',
      'Matikan **"Kelihatan kepada majikan"** dan **"Tunjukkan gred"** dalam Profil Saya.',
      'Padam projek, sijil, anugerah atau perbualan Pembantu AI secara berasingan.',
    ]],
    ['rights', 'Hak anda', [
      '**Melihat dan membetulkan** maklumat anda dalam Profil Saya dan Tetapan Akaun.',
      '**Memuat turun** salinan semua yang disimpan oleh SkillMap tentang anda: Tetapan Akaun → Muat turun data saya.',
      '**Memadam** akaun anda dan datanya: Tetapan Akaun → Padam akaun.',
    ]],
    ['complain', 'Cara membuat aduan', [
      'E-mel **pejabat kerjaya** terlebih dahulu di {contact}; mereka akan menjawab dan membetulkan sebarang kesilapan.',
      'Jika anda tidak berpuas hati, anda boleh membuat aduan kepada **Pesuruhjaya Perlindungan Data Peribadi** Malaysia.',
    ]],
    ['changes', 'Perubahan kepada notis ini', [
      'Jika notis ini berubah, tarikh di bahagian atas halaman ini akan berubah dan perubahan utama akan disenaraikan di sini.',
    ]],
  ],
}
