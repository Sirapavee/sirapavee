import { TestScene } from './TestScene';

export const metadata = {
  title: 'Test',
  description: 'Test page for 3D rendering',
};

export default function TestPage() {
  // const OrbitControl = new OrbitControls();
  // extend({ OrbitControl });

  return (
    <div className='flex h-dvh w-dvw'>
      <TestScene />
    </div>
  );
}
