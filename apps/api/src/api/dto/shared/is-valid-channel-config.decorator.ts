import type {
  ValidationArguments,
  ValidationOptions} from 'class-validator';
import {
  registerDecorator
} from 'class-validator';
import { isSlackConfig, isEmailConfig } from '@qurvo/nestjs-infra';

function isValidTelegramConfig(config: unknown): boolean {
  if (typeof config !== 'object' || config === null) {return false;}
  const c = config as Record<string, unknown>;
  return (
    typeof c.bot_token === 'string' &&
    (typeof c.chat_id === 'string' || typeof c.chat_id === 'number')
  );
}

function getValidationError(channelType: unknown, config: unknown): string | null {
  if (typeof channelType !== 'string') {
    return null; // channel_type absent/invalid — IsIn will handle it
  }

  switch (channelType) {
    case 'slack': {
      if (!isSlackConfig(config)) {
        return 'channel_config for slack must contain webhook_url (string)';
      }
      try {
        new URL((config as { webhook_url: string }).webhook_url);
      } catch {
        return 'channel_config.webhook_url must be a valid URL';
      }
      return null;
    }

    case 'email': {
      if (!isEmailConfig(config)) {
        return 'channel_config for email must contain email (string)';
      }
      return null;
    }

    case 'telegram': {
      if (!isValidTelegramConfig(config)) {
        return 'channel_config for telegram must contain bot_token (string) and chat_id (string or number)';
      }
      return null;
    }

    default:
      return null; // unknown channel type — IsIn will handle it
  }
}

/**
 * Cross-field validator: validates channel_config structure against channel_type.
 * Must be applied to the channel_config field. Reads channel_type from the same object.
 *
 * Supported channel types:
 *   - slack: requires { webhook_url: string (URL) }
 *   - email: requires { email: string }
 *   - telegram: requires { bot_token: string, chat_id: string | number }
 */
export function IsValidChannelConfig(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isValidChannelConfig',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          const obj = args.object as Record<string, unknown>;
          return getValidationError(obj['channel_type'], value) === null;
        },
        defaultMessage(args: ValidationArguments): string {
          const obj = args.object as Record<string, unknown>;
          return (
            getValidationError(obj['channel_type'], args.value) ??
            'channel_config is invalid for the given channel_type'
          );
        },
      },
    });
  };
}
