/**
 * contact-form.js — handlers for contact-form.json
 *
 * Validation logic lives in JSONata $compute expressions in the JSON.
 * Handlers here only manage state mutations and side effects.
 */

export default {

  /** Sync $name with the input value. */
  setName(event)    { this.$name.set(event.target.value); },

  /** Sync $email with the input value. */
  setEmail(event)   { this.$email.set(event.target.value); },

  /** Sync $message with the textarea value. */
  setMessage(event) { this.$message.set(event.target.value); },

  /**
   * Submit the form.
   * In a real app this would POST to an API. Here it shows a confirmation.
   */
  submit() {
    if (!this.$formValid.get()) return;
    console.log('Form submitted:', {
      name:    this.$name.get(),
      email:   this.$email.get(),
      message: this.$message.get(),
    });
    this.$submitted.set(true);
    this.reset();
  },

  /** Clear all form fields and hide the confirmation message. */
  reset() {
    this.$name.set('');
    this.$email.set('');
    this.$message.set('');
    this.$submitted.set(false);
  },

};
