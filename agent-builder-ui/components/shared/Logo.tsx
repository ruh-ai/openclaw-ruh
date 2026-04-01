import { ruhFaviconIcon } from "@/shared/constants";
import Image from "next/image";

export const Logo = () => {
  return (
    <div>
      <Image src={ruhFaviconIcon} alt="Logo" width={30} height={30} priority unoptimized />
    </div>
  );
};
