import { Client } from 'pg';
import * as dotenv from 'dotenv';
import * as bcrypt from 'bcryptjs';

dotenv.config({ path: '../.env' }); // Load root .env

const PG_CONNECTION_STRING =
  process.env.DATABASE_URL ||
  'postgresql://user:password@localhost:5432/echo_db';

const pgClient = new Client({
  connectionString: PG_CONNECTION_STRING,
});

async function seedDatabase() {
  try {
    await pgClient.connect();

    console.log('Connected to PostgreSQL for seeding.');

    // Clear existing data (optional, for development)
    await pgClient.query('TRUNCATE TABLE users RESTART IDENTITY CASCADE;');
    await pgClient.query('TRUNCATE TABLE servers RESTART IDENTITY CASCADE;');
    await pgClient.query('TRUNCATE TABLE channels RESTART IDENTITY CASCADE;');
    await pgClient.query('TRUNCATE TABLE messages RESTART IDENTITY CASCADE;');
    console.log('Cleared existing data.');

    // Seed Users (passwords are hashed with bcrypt)
    const passwordHash1 = await bcrypt.hash('password1', 10);
    const passwordHash2 = await bcrypt.hash('password2', 10);
    const user1 = await pgClient.query(
      `INSERT INTO users (username, email, password_hash, status) VALUES ($1, $2, $3, $4) RETURNING *;`,
      ['Alice', 'alice@example.com', passwordHash1, 'online'],
    );
    const user2 = await pgClient.query(
      `INSERT INTO users (username, email, password_hash, status) VALUES ($1, $2, $3, $4) RETURNING *;`,
      ['Bob', 'bob@example.com', passwordHash2, 'offline'],
    );
    console.log('Seeded users.');

    // Seed Servers
    const server1 = await pgClient.query(
      `INSERT INTO servers (name, owner_id) VALUES ($1, $2) RETURNING *;`,
      ['General Chat', user1.rows[0].id],
    );
    console.log('Seeded servers.');

    // Seed Channels
    const channel1 = await pgClient.query(
      `INSERT INTO channels (name, server_id, type) VALUES ($1, $2, $3) RETURNING *;`,
      ['general', server1.rows[0].id, 'text'],
    );
    const channel2 = await pgClient.query(
      `INSERT INTO channels (name, server_id, type) VALUES ($1, $2, $3) RETURNING *;`,
      ['random', server1.rows[0].id, 'text'],
    );
    console.log('Seeded channels.');

    // Seed Messages
    await pgClient.query(
      `INSERT INTO messages (channel_id, author_id, content) VALUES ($1, $2, $3);`,
      [channel1.rows[0].id, user1.rows[0].id, 'Hello everyone!'],
    );
    await pgClient.query(
      `INSERT INTO messages (channel_id, author_id, content) VALUES ($1, $2, $3);`,
      [channel1.rows[0].id, user2.rows[0].id, 'Hi Alice!'],
    );
    console.log('Seeded messages.');

    // Presence is established at runtime when users connect via Socket.IO.

    console.log('Database seeding complete!');
  } catch (error) {
    console.error('Error seeding database:', error);
  } finally {
    await pgClient.end();
    console.log('Disconnected from PostgreSQL.');
  }
}

seedDatabase();
