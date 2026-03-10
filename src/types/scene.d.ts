export type ConfigProps = {
  configValue: {
    [key: string]: number;
  };
  mode: 'start' | 'cleaning' | 'stop' | 'idle';
};
