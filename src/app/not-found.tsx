import { themeSubHeader } from '@/const/tailwindClass';
import { cn } from '@/utils/className';

export default function PageNotFound() {
  return (
    <div className='flex h-dvh w-dvw items-center justify-center'>
      <div className={cn('typo-headline-1', themeSubHeader)}>Page Not Found</div>
    </div>
  );
}
