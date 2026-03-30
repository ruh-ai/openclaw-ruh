interface InstallButtonProps {
  installed: boolean;
  loading?: boolean;
  onInstall: () => void;
  onUninstall: () => void;
}

export function InstallButton({ installed, loading, onInstall, onUninstall }: InstallButtonProps) {
  if (installed) {
    return (
      <button
        onClick={onUninstall}
        disabled={loading}
        className="px-4 py-2 text-xs font-bold border border-[#e5e5e3] text-[#4a4a4a] rounded-lg hover:border-red-300 hover:text-red-500 hover:bg-red-50 disabled:opacity-50 transition-colors"
      >
        {loading ? "..." : "Uninstall"}
      </button>
    );
  }
  return (
    <button
      onClick={onInstall}
      disabled={loading}
      className="px-4 py-2 text-xs font-bold text-white bg-[#ae00d0] rounded-lg hover:opacity-90 disabled:opacity-50 transition-colors"
    >
      {loading ? "Installing..." : "Install Agent"}
    </button>
  );
}
