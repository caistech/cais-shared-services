/**
 * Credential Vault Adapter
 *
 * Abstracts credential storage so agent code never touches raw secrets.
 * Supports three providers: Supabase Vault (pgsodium), environment variables, AWS Secrets Manager.
 *
 * Usage:
 *   const vault = createVault('supabase', { supabaseClient: adminClient });
 *   const apiKey = await vault.getSecret('GHL_API_KEY_org123');
 *
 * Reusable across any Node.js/Next.js project — no project-specific imports.
 */

// ============================================================
// Provider: Environment Variables (dev/local only)
// ============================================================

function createEnvProvider() {
  return {
    async getSecret(key) {
      const value = process.env[key];
      if (!value) {
        throw new VaultError(`Secret "${key}" not found in environment`, 'NOT_FOUND');
      }
      return value;
    },

    async setSecret(key, value) {
      // env vars are read-only at runtime — log a warning
      console.warn(
        `[credential-vault] Cannot persist secret "${key}" to env at runtime. ` +
        `Set it in your .env file or hosting platform.`
      );
      process.env[key] = value;
    },

    async rotateSecret(key, newValue) {
      await this.setSecret(key, newValue);
    },

    async listKeys() {
      // Return only keys that look like secrets (uppercase, underscored)
      return Object.keys(process.env).filter(k => /^[A-Z][A-Z0-9_]+$/.test(k));
    },

    async deleteSecret(key) {
      delete process.env[key];
    }
  };
}

// ============================================================
// Provider: Supabase Vault (pgsodium)
// ============================================================

function createSupabaseProvider(config) {
  const { supabaseClient } = config;

  if (!supabaseClient) {
    throw new VaultError('supabaseClient is required for Supabase Vault provider', 'CONFIG_ERROR');
  }

  return {
    async getSecret(key) {
      const { data, error } = await supabaseClient.rpc('vault_read_secret', {
        secret_name: key
      });

      if (error) {
        // Fallback: try direct query on vault.decrypted_secrets view
        const { data: fallbackData, error: fallbackError } = await supabaseClient
          .from('vault.decrypted_secrets')
          .select('decrypted_secret')
          .eq('name', key)
          .single();

        if (fallbackError) {
          throw new VaultError(
            `Failed to read secret "${key}": ${fallbackError.message}`,
            'READ_ERROR'
          );
        }
        return fallbackData.decrypted_secret;
      }

      if (!data || data.length === 0) {
        throw new VaultError(`Secret "${key}" not found in vault`, 'NOT_FOUND');
      }

      return data[0].decrypted_secret || data;
    },

    async setSecret(key, value) {
      // Try insert via vault.create_secret
      const { error } = await supabaseClient.rpc('vault_create_secret', {
        secret_name: key,
        secret_value: value
      });

      if (error) {
        // If exists, update instead
        if (error.message.includes('duplicate') || error.message.includes('unique')) {
          return this.rotateSecret(key, value);
        }
        throw new VaultError(
          `Failed to store secret "${key}": ${error.message}`,
          'WRITE_ERROR'
        );
      }
    },

    async rotateSecret(key, newValue) {
      const { error } = await supabaseClient.rpc('vault_update_secret', {
        secret_name: key,
        new_secret_value: newValue
      });

      if (error) {
        throw new VaultError(
          `Failed to rotate secret "${key}": ${error.message}`,
          'WRITE_ERROR'
        );
      }
    },

    async listKeys() {
      const { data, error } = await supabaseClient
        .from('vault.decrypted_secrets')
        .select('name');

      if (error) {
        throw new VaultError(
          `Failed to list vault keys: ${error.message}`,
          'READ_ERROR'
        );
      }

      return (data || []).map(row => row.name);
    },

    async deleteSecret(key) {
      const { error } = await supabaseClient.rpc('vault_delete_secret', {
        secret_name: key
      });

      if (error) {
        throw new VaultError(
          `Failed to delete secret "${key}": ${error.message}`,
          'WRITE_ERROR'
        );
      }
    }
  };
}

// ============================================================
// Provider: AWS Secrets Manager
// ============================================================

function createAwsProvider(config) {
  const { region, credentials } = config;

  // Lazy-load AWS SDK to avoid requiring it in non-AWS projects
  let client = null;

  function getClient() {
    if (client) return client;

    try {
      const { SecretsManagerClient } = require('@aws-sdk/client-secrets-manager');
      const clientConfig = { region: region || 'ap-southeast-2' };
      if (credentials) {
        clientConfig.credentials = credentials;
      }
      client = new SecretsManagerClient(clientConfig);
      return client;
    } catch (err) {
      throw new VaultError(
        'AWS SDK not installed. Run: npm install @aws-sdk/client-secrets-manager',
        'CONFIG_ERROR'
      );
    }
  }

  function getCommands() {
    try {
      return require('@aws-sdk/client-secrets-manager');
    } catch (err) {
      throw new VaultError(
        'AWS SDK not installed. Run: npm install @aws-sdk/client-secrets-manager',
        'CONFIG_ERROR'
      );
    }
  }

  return {
    async getSecret(key) {
      const sm = getClient();
      const { GetSecretValueCommand } = getCommands();

      try {
        const result = await sm.send(new GetSecretValueCommand({ SecretId: key }));
        return result.SecretString;
      } catch (err) {
        if (err.name === 'ResourceNotFoundException') {
          throw new VaultError(`Secret "${key}" not found in AWS`, 'NOT_FOUND');
        }
        throw new VaultError(
          `Failed to read secret "${key}" from AWS: ${err.message}`,
          'READ_ERROR'
        );
      }
    },

    async setSecret(key, value) {
      const sm = getClient();
      const { CreateSecretCommand } = getCommands();

      try {
        await sm.send(new CreateSecretCommand({
          Name: key,
          SecretString: value
        }));
      } catch (err) {
        if (err.name === 'ResourceExistsException') {
          return this.rotateSecret(key, value);
        }
        throw new VaultError(
          `Failed to store secret "${key}" in AWS: ${err.message}`,
          'WRITE_ERROR'
        );
      }
    },

    async rotateSecret(key, newValue) {
      const sm = getClient();
      const { PutSecretValueCommand } = getCommands();

      try {
        await sm.send(new PutSecretValueCommand({
          SecretId: key,
          SecretString: newValue
        }));
      } catch (err) {
        throw new VaultError(
          `Failed to rotate secret "${key}" in AWS: ${err.message}`,
          'WRITE_ERROR'
        );
      }
    },

    async listKeys() {
      const sm = getClient();
      const { ListSecretsCommand } = getCommands();

      try {
        const result = await sm.send(new ListSecretsCommand({}));
        return (result.SecretList || []).map(s => s.Name);
      } catch (err) {
        throw new VaultError(
          `Failed to list AWS secrets: ${err.message}`,
          'READ_ERROR'
        );
      }
    },

    async deleteSecret(key) {
      const sm = getClient();
      const { DeleteSecretCommand } = getCommands();

      try {
        await sm.send(new DeleteSecretCommand({
          SecretId: key,
          ForceDeleteWithoutRecovery: false,
          RecoveryWindowInDays: 7
        }));
      } catch (err) {
        throw new VaultError(
          `Failed to delete secret "${key}" from AWS: ${err.message}`,
          'WRITE_ERROR'
        );
      }
    }
  };
}

// ============================================================
// Vault Error
// ============================================================

class VaultError extends Error {
  /**
   * @param {string} message
   * @param {'NOT_FOUND'|'READ_ERROR'|'WRITE_ERROR'|'CONFIG_ERROR'} code
   */
  constructor(message, code) {
    super(message);
    this.name = 'VaultError';
    this.code = code;
  }
}

// ============================================================
// Factory
// ============================================================

/**
 * Create a credential vault instance.
 *
 * @param {'supabase'|'env'|'aws'} provider - Which backend to use
 * @param {object} [config] - Provider-specific configuration
 * @param {object} [config.supabaseClient] - Required for 'supabase' provider (service role client)
 * @param {string} [config.region] - AWS region (default: 'ap-southeast-2')
 * @param {object} [config.credentials] - AWS credentials override
 * @returns {{ getSecret, setSecret, rotateSecret, listKeys, deleteSecret }}
 */
function createVault(provider, config = {}) {
  switch (provider) {
    case 'env':
      return createEnvProvider();
    case 'supabase':
      return createSupabaseProvider(config);
    case 'aws':
      return createAwsProvider(config);
    default:
      throw new VaultError(
        `Unknown vault provider "${provider}". Use 'env', 'supabase', or 'aws'.`,
        'CONFIG_ERROR'
      );
  }
}

module.exports = { createVault, VaultError };
