"use client";

interface UserMessageProps {
  message: string;
}

export const UserMessage: React.FC<UserMessageProps> = ({ message }) => {
  return (
    <div className="flex justify-end animate-fadeIn">
      <div className="bg-[var(--user-bubble,#f3f4f6)] text-sm font-satoshi-regular text-text-primary rounded-2xl px-4 py-2.5 max-w-[80%]">
        {message}
      </div>
    </div>
  );
};
