import tracer from 'dd-trace';

tracer.init({
  logInjection: true,
  runtimeMetrics: true,
  profiling: true,
});

export default tracer;
