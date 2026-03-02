import Image from "next/image"

interface FacebookPostHeaderProps {
    datePrefix?: string; // e.g. "Freitag, 13.03.2026"
    className?: string; // to allow overriding classes if needed
    postNumber?: number; // e.g. 1
}

export function FacebookPostHeader({ datePrefix = "Veröffentlichungsdatum", postNumber, className = "" }: FacebookPostHeaderProps) {
    return (
        <div className={`bg-[#1877F2] text-white p-3 flex items-center gap-2 ${className}`}>
            <div className="w-5 h-5 shrink-0 relative flex items-center justify-center bg-white rounded-sm overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src="/facebook-logo.png"
                    alt="Facebook Logo"
                    className="w-full h-full object-contain"
                    onError={(e) => {
                        // Fallback simply hides the image if it doesn't exist yet, or shows a placeholder 'f'
                        e.currentTarget.style.display = 'none';
                        if (e.currentTarget.parentElement) {
                            e.currentTarget.parentElement.innerHTML = '<span class="text-[#1877F2] font-bold text-xs">f</span>';
                        }
                    }}
                />
            </div>
            <div className="font-semibold text-sm">
                {postNumber !== undefined ? `Post ${postNumber} · ` : ""}Facebook &middot; {datePrefix}
            </div>
        </div>
    )
}
