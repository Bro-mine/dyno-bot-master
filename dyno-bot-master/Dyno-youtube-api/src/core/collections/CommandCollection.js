'use strict';

const each = require('async-each');
const chalk = require('chalk');
const EventCollection = requireReload(require)('../interfaces/EventCollection');
const logger = requireReload(require)('../logger');
const utils = requireReload(require)('../utils');
const models = require('../models');

/**
 * @class CommandCollection
 * @extends EventCollection
 */
class CommandCollection extends EventCollection {
	/**
	 * A collection of commands
	 * @param {Object} config The Dyno configuration object
	 * @param {Dyno} dyno The Dyno instance
	 */
	constructor(config, dyno) {
		super();

		this.dyno = dyno;
		this._client = dyno.client;
		this._config = config;

		this.loadCommands();
	}

	/**
	 * Load commands
	 */
	async loadCommands() {
		let t = process.hrtime();
		const files = await utils.readdirRecursive(this._config.paths.commands)
			.then((files) => {
				t = process.hrtime(t);
				var nanoToMs = 1e-6;
				logger.debug(`readdirRecursive benchmark took %ds, ${chalk.yellow(Math.round(t[1] * nanoToMs) + 'ms')}`, t[0]);
				return files;
			});

		each(files, (file, next) => {
			if (!file.endsWith('.js')) return next();
			let load = () => {
				var command = requireReload(file);
				this.register(command);
			};
			load();
			// utils.time(load, file);
			return next();
		}, err => {
			if (err) logger.error(err);
			logger.info(`[CommandCollection] Registered ${this.size} commands.`);
		});
	}

	/**
	 * Register command
	 * @param {Function} Command A Command class to register
	 */
	register(Command) {
		if (typeof Command !== 'function') {
			logger.debug('[CommandCollection] Skipping unknown command');
			return;
		}

		// create the command
		let command = new Command(this._config, this.dyno);

		// ensure command defines all required properties/methods
		command.name = command.aliases[0];

		logger.debug(`[CommandCollection] Registering command ${command.name}`);

		models.Command.update({ name: command.name, _state: this._config.state }, command.toJSON(), { upsert: true })
			.catch(err => logger.error(err));

		if (command.aliases && command.aliases.length) {
			for (let alias of command.aliases) {
				this.set(alias, command);
			}
		}
	}

	/**
	 * Unregister command
	 * @param {String} name Name of the command to unregister
	 */
	unregister(name) {
		logger.info(`Unregistering command: ${name}`);

		const command = this.get(name);
		if (!command) return;

		if (!command.aliases && !command.aliases.length) return;
		for (let alias of command.aliases) {
			logger.info(`Removing alias ${alias}`);
			this.delete(alias);
		}
	}
}

module.exports = CommandCollection;