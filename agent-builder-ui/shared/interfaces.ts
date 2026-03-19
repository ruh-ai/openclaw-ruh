// ==========================================
// UI Component Interfaces
// ==========================================

// Primary button props interface
export interface PrimaryButtonProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
}

// Secondary button props interface
export interface SecondaryButtonProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  isLoading?: boolean;
  disabled?: boolean;
}

// Standard API error structure
export interface APIError {
  response?: {
    data?: {
      detail?: string;
      message?: string;
    };
    status?: number;
  };
}

// Pagination metadata
export interface PaginationMetadata {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
}
