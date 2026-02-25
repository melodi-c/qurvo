import tracer from 'dd-trace';
tracer.init({
  logInjection: true,
  runtimeMetrics: true,
  startupLogs: false,
});
export default tracer;
