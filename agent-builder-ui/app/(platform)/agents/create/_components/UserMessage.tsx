"use client";

interface UserMessageProps {
  message: string;
}

export const UserMessage: React.FC<UserMessageProps> = ({ message }) => {
  // Check if message has newlines (multi-line selections summary)
  const lines = message.split("\n");
  const isMultiLine = lines.length > 1;

  return (
    <div className="flex justify-end animate-fadeIn">
      <div className="bg-[var(--user-bubble,#f3f4f6)] text-sm font-satoshi-regular text-text-primary rounded-2xl px-4 py-2.5 max-w-[80%]">
        {isMultiLine ? (
          <div className="space-y-1">
            {lines.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        ) : (
          message
        )}
      </div>
    </div>
  );
};
