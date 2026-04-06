/**
 * contact-form.js — external functions for contact-form.json
 *
 * With the new $defs grammar, all handlers are defined inline as
 * $prototype: "Function" entries with `body`. This sidecar is
 * kept as documentation of the external $src pattern.
 */

export function setName(event) { this.$name.set(event.target.value); }
export function setEmail(event) { this.$email.set(event.target.value); }
export function setMessage(event) { this.$message.set(event.target.value); }

export function submit() {
  if (!this.$formValid.get()) return;
  console.log('Form submitted:', {
    name:    this.$name.get(),
    email:   this.$email.get(),
    message: this.$message.get(),
  });
  this.$submitted.set(true);
  this.reset();
}

export function reset() {
  this.$name.set('');
  this.$email.set('');
  this.$message.set('');
  this.$submitted.set(false);
}
