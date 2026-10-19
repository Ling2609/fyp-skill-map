# Labelling guide: other requirements (E6)

Read each ad in full and fill one row per ad in labels_author.csv. Write what the AD says, not what you think the
job needs. Leave the column empty (or write none) when the ad does not say it.

- **qualification**: the LOWEST level the ad accepts: none, diploma, bachelor, master or phd.
  "Bachelor's or Master's" = bachelor. "Diploma/Degree" = diploma. "Master's or above" = master. "Degree" = bachelor.
- **field**: the subject(s) of study named, as written: e.g. "Computer Science, IT or related". none if not named.
- **languages**: languages the candidate must or should speak/write, comma separated: e.g. English, Mandarin.
  Not languages that are only mentioned (a product in Bahasa Melayu, Chinese New Year).
- **citizenship**: yes if the ad limits who may apply by citizenship, permanent residence or a work pass
  ("Malaysians only", "must have the right to work in Singapore", "no visa sponsorship"); otherwise no.
- **salary**: only if the row says salary_field = (empty): the salary amount written in the ad, e.g. "RM 2,800 - 3,200";
  none if the ad gives no amount. Skip (leave empty) when salary_field already has a value.
