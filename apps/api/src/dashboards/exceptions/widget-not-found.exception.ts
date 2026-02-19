export class WidgetNotFoundException extends Error {
  constructor(message = 'Widget not found') {
    super(message);
    this.name = 'WidgetNotFoundException';
  }
}
