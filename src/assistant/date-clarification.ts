import type { ConversationMessage } from "@/schemas/chat";

const months = [
  "january|jan|января|январь",
  "february|feb|февраля|февраль",
  "march|mar|марта|март",
  "april|apr|апреля|апрель",
  "may|мая|май",
  "june|jun|июня|июнь",
  "july|jul|июля|июль",
  "august|aug|августа|август",
  "september|sept|sep|сентября|сентябрь",
  "october|oct|октября|октябрь",
  "november|nov|ноября|ноябрь",
  "december|dec|декабря|декабрь",
];
function namedDates(text: string) {
  const month = `(${months.join("|")})\\.?`;
  const day = "(\\d{1,2})(?:st|nd|rd|th)?";
  const year = "(?:,?\\s+((?:19|20|21)\\d{2}))?";
  const patterns = [
    { expression: `${month}\\s+${day}${year}`, monthIndex: 1, dayIndex: 2 },
    { expression: `${day}\\s+${month}${year}`, monthIndex: 2, dayIndex: 1 },
  ];
  return patterns.flatMap(({ expression, monthIndex, dayIndex }) =>
    [
      ...text.matchAll(
        new RegExp(`(?<![\\p{L}\\d])${expression}(?!\\d)`, "giu"),
      ),
    ]
      .filter(
        (match) =>
          Number(match[dayIndex]) >= 1 && Number(match[dayIndex]) <= 31,
      )
      .map((match) => ({
        month: months.findIndex((aliases) =>
          new RegExp(`^(?:${aliases})$`, "iu").test(match[monthIndex]),
        ),
        day: Number(match[dayIndex]),
        year: match[3] ? Number(match[3]) : null,
      })),
  );
}

export function dateClarification(messages: ConversationMessage[]) {
  const latest = messages.at(-1);
  if (latest?.role !== "user") return null;
  const confirmed = messages
    .filter((message) => message.role === "user")
    .flatMap((message) => namedDates(message.content))
    .filter((date) => date.year !== null);
  const missingYear = namedDates(latest.content).some(
    (date) =>
      date.year === null &&
      !confirmed.some(
        (known) => known.day === date.day && known.month === date.month,
      ),
  );
  if (!missingYear) return null;
  return /[а-яё]/iu.test(latest.content)
    ? "Какой год ты имеешь в виду и какой часовой пояс использовать?"
    : "Which year do you mean for that date, and what time zone should I use?";
}
